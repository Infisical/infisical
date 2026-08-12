/**
 * The three-pane live view: the guide's steps on the left, the browser in the middle, the
 * agent's reasoning and findings on the right.
 *
 * A single self-contained string with no build step and no external requests, so it works from
 * a bare Node http server and cannot break because a CDN is unreachable mid-demo.
 */
export const DASHBOARD_HTML = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Guiderails live</title>
<style>
:root {
  --bg:#0b0e13; --panel:#12161d; --line:#232a34; --fg:#e6edf3; --muted:#8b95a3;
  --pass:#3fb950; --fail:#f85149; --warn:#d29922; --skip:#6b7785; --accent:#58a6ff;
}
* { box-sizing:border-box; }
html,body { height:100%; margin:0; }
body {
  background:var(--bg); color:var(--fg); overflow:hidden;
  font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
}
header {
  height:48px; display:flex; align-items:center; gap:1rem; padding:0 1rem;
  border-bottom:1px solid var(--line); background:var(--panel);
}
header .guide { font-weight:600; }
header .meta { color:var(--muted); font-size:.8rem; }
header .status { margin-left:auto; font-size:.75rem; text-transform:uppercase;
                 letter-spacing:.06em; color:var(--muted); }
header .status.live { color:var(--pass); }
main { display:grid; grid-template-columns:22rem 1fr 24rem; height:calc(100% - 48px); }
section { overflow-y:auto; padding:.75rem 1rem; }
section + section { border-left:1px solid var(--line); }
h2 { font-size:.7rem; text-transform:uppercase; letter-spacing:.08em; color:var(--muted);
     margin:.25rem 0 .75rem; font-weight:600; }
ol { list-style:none; margin:0; padding:0; }
li.step { display:flex; gap:.6rem; padding:.45rem .5rem; border-radius:5px;
          align-items:flex-start; font-size:.875rem; }
li.step .dot { width:1.1rem; flex:0 0 1.1rem; text-align:center; color:var(--muted);
               font-variant-numeric:tabular-nums; font-size:.78rem; padding-top:.1rem; }
li.step.active { background:#182030; box-shadow:inset 2px 0 0 var(--accent); }
li.step.passed .dot { color:var(--pass); }
li.step.failed .dot { color:var(--fail); }
li.step.unverified .dot { color:var(--warn); }
li.step.skipped { opacity:.5; }
#browser { display:flex; align-items:center; justify-content:center; padding:.5rem; }
#browser img { max-width:100%; max-height:100%; border:1px solid var(--line);
               border-radius:6px; background:#000; }
#browser .placeholder { color:var(--muted); font-size:.85rem; }
.entry { border-left:2px solid var(--line); padding:.15rem 0 .5rem .6rem; margin-bottom:.35rem;
         font-size:.83rem; }
.entry.thinking { color:var(--muted); font-style:italic; }
.entry.tool { border-left-color:var(--accent); font-family:ui-monospace,Menlo,monospace;
              font-size:.78rem; }
.entry.finding { border-left-color:var(--warn); color:var(--fg); }
.entry.finding .sev { color:var(--warn); font-weight:700; font-size:.7rem;
                      text-transform:uppercase; letter-spacing:.05em; display:block; }
.entry.log { color:var(--muted); font-size:.78rem; }
footer { position:fixed; bottom:0; left:0; right:0; height:0; }
.totals { display:flex; gap:.85rem; font-size:.78rem; color:var(--muted); flex-wrap:wrap;
          padding:.5rem 0 0; border-top:1px solid var(--line); margin-top:.75rem; }
.totals b { color:var(--fg); font-variant-numeric:tabular-nums; }
</style>
</head>
<body>
<header>
  <span class="guide" id="guide">waiting for a run</span>
  <span class="meta" id="meta"></span>
  <span class="status" id="status">connecting</span>
</header>
<main>
  <section>
    <h2>Guide steps</h2>
    <ol id="steps"></ol>
    <div class="totals" id="totals" hidden></div>
  </section>
  <section id="browser"><span class="placeholder">the browser appears here once the run starts</span></section>
  <section>
    <h2>Agent</h2>
    <div id="feed"></div>
  </section>
</main>
<script>
const el = (id) => document.getElementById(id);
const steps = new Map();
let activeStep = null;

const renderSteps = () => {
  el("steps").innerHTML = [...steps.values()].map((step) => {
    const cls = ["step", step.outcome ?? "", step.index === activeStep ? "active" : ""].join(" ");
    const mark = step.outcome === "passed" ? "OK"
      : step.outcome === "failed" ? "X"
      : step.outcome === "unverified" ? "?"
      : step.outcome === "skipped" ? "-"
      : step.index;
    return '<li class="' + cls + '"><span class="dot">' + mark + '</span><span>'
      + escapeHtml(step.instruction) + '</span></li>';
  }).join("");
};

const escapeHtml = (s) => String(s)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

const append = (cls, html) => {
  const feed = el("feed");
  const node = document.createElement("div");
  node.className = "entry " + cls;
  node.innerHTML = html;
  feed.appendChild(node);
  // Only autoscroll when already at the bottom, so reading back through the feed mid-run
  // does not keep yanking the view away.
  const parent = feed.parentElement;
  const atBottom = parent.scrollHeight - parent.scrollTop - parent.clientHeight < 80;
  if (atBottom) parent.scrollTop = parent.scrollHeight;
};

const connect = () => {
  const socket = new WebSocket("ws://" + location.host);

  socket.onopen = () => {
    el("status").textContent = "live";
    el("status").className = "status live";
  };

  socket.onclose = () => {
    el("status").textContent = "disconnected";
    el("status").className = "status";
    setTimeout(connect, 1500);
  };

  socket.onmessage = (message) => {
    const event = JSON.parse(message.data);
    switch (event.type) {
      case "run_started":
        steps.clear(); activeStep = null;
        el("feed").innerHTML = "";
        el("guide").textContent = event.guide;
        el("meta").textContent = event.baseUrl + " \\u00b7 fixture " + event.fixture
          + " \\u00b7 " + event.totalSteps + " steps";
        el("totals").hidden = true;
        renderSteps();
        break;
      case "step_started":
        activeStep = event.docStepIndex;
        steps.set(event.docStepIndex, {
          index: event.docStepIndex, instruction: event.instruction, outcome: null
        });
        renderSteps();
        append("log", "step " + event.docStepIndex + " via " + event.mode);
        break;
      case "step_result": {
        const step = steps.get(event.docStepIndex);
        if (step) { step.outcome = event.outcome; }
        else { steps.set(event.docStepIndex, { index: event.docStepIndex, instruction: event.detail, outcome: event.outcome }); }
        renderSteps();
        break;
      }
      case "thinking":
        append("thinking", escapeHtml(event.text));
        break;
      case "assistant_text":
        append("", escapeHtml(event.text));
        break;
      case "tool_call":
        append("tool", escapeHtml(event.name));
        break;
      case "finding":
        append("finding", '<span class="sev">' + escapeHtml(event.severity) + '</span>'
          + escapeHtml(event.summary));
        break;
      case "log":
        append("log", escapeHtml(event.text));
        break;
      case "frame":
        el("browser").innerHTML = '<img alt="live browser" src="data:image/jpeg;base64,'
          + event.jpegBase64 + '">';
        break;
      case "run_finished":
        activeStep = null;
        renderSteps();
        el("totals").hidden = false;
        el("totals").innerHTML =
            "<span><b>" + event.passed + "</b> verified</span>"
          + "<span><b>" + event.failed + "</b> failed</span>"
          + "<span><b>" + event.unverified + "</b> unverified</span>"
          + "<span><b>" + event.skipped + "</b> skipped</span>";
        break;
    }
  };
};

connect();
</script>
</body>
</html>`;
