// Sidebar entries for CLI commands are `url:` stub pages pointing at headings on /cli/reference.
// Mintlify renders every `url:` page as an external link (new tab, arrow icon), so this keeps
// them in the same tab and, on the reference page, highlights whichever command is in view.
(function () {
  var TARGET = /\/cli\/reference#([^/?#]+)$/;

  function targetOf(link) {
    var match = (link.getAttribute("href") || "").match(TARGET);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function onReferencePage() {
    return /\/cli\/reference\/?$/.test(window.location.pathname);
  }

  // Only a scroller inside the sidebar counts. On mobile the sidebar is a closed drawer, and
  // the nearest scrollable ancestor is the page itself: scrolling that to "keep the link in
  // view" moves the page, which fires this again and runs away to the bottom.
  function scrollParent(el) {
    var sidebar = el.closest("#sidebar-content");
    if (!sidebar) return null;
    for (var node = el.parentElement; node; node = node.parentElement) {
      if (!sidebar.contains(node) && node !== sidebar.parentElement) return null;
      var overflow = getComputedStyle(node).overflowY;
      if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight) {
        return node;
      }
    }
    return null;
  }

  // scrollIntoView would also scroll the page and cut short a smooth scroll already under way,
  // so only the sidebar's own scroller moves.
  function keepVisible(link) {
    if (!link.getClientRects().length) return;
    var scroller = scrollParent(link);
    if (!scroller || scroller === document.scrollingElement || scroller === document.body) return;
    var box = scroller.getBoundingClientRect();
    var linkBox = link.getBoundingClientRect();
    if (linkBox.top < box.top + 48 || linkBox.bottom > box.bottom - 48) {
      scroller.scrollTo({
        top: scroller.scrollTop + linkBox.top - box.top - box.height / 3,
        behavior: "smooth"
      });
    }
  }

  var current = { id: null, path: null };

  // The sidebar lists only root commands, so a subcommand in view lights up its root's entry.
  function sidebarTarget(id, path) {
    var ids = {};
    document.querySelectorAll('#sidebar-content a[href*="/cli/reference#"]').forEach(function (link) {
      ids[targetOf(link)] = true;
    });
    if (ids[id]) return id;
    var root = path ? path.split(" ")[0] : null;
    return root && ids[root] ? root : id;
  }

  function highlight(id, path) {
    current = { id: id, path: path || null };
    var root = document.documentElement;
    var target = id === null ? null : sidebarTarget(id, current.path);
    var active = null;
    document.querySelectorAll('a[href*="/cli/reference#"]').forEach(function (link) {
      link.removeAttribute("target");
      var on = target !== null && targetOf(link) === target;
      link.classList.toggle("cli-nav-active", on);
      if (on && link.closest("#sidebar-content")) active = link;
    });
    if (active) {
      root.setAttribute("data-cli-nav", target);
      keepVisible(active);
    } else {
      root.removeAttribute("data-cli-nav");
    }
  }

  window.addEventListener("cli-reference:active", function (event) {
    var detail = event.detail || {};
    highlight(detail.id || null, detail.path);
  });

  // Sidebar links that render later, such as when Mintlify re-renders the sidebar, need the
  // highlight too.
  var pending = 0;
  new MutationObserver(function () {
    if (current.id === null) return;
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(function () {
      highlight(current.id, current.path);
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener(
    "click",
    function (event) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      var link = event.target.closest && event.target.closest('a[href*="/cli/reference#"]');
      if (!link || link.closest(".cli-ref")) return;
      var id = targetOf(link);
      if (!id) return;
      // Capture phase, so Mintlify's own handler never opens the new tab.
      event.preventDefault();
      event.stopPropagation();
      var section = onReferencePage() ? document.getElementById(id) : null;
      if (!section) {
        window.location.assign(link.href);
        return;
      }
      // A sidebar click is navigation, so it lands at once like a page load would.
      section.scrollIntoView();
      window.history.replaceState(window.history.state, "", "#" + id);
      highlight(id, section.dataset.command);
    },
    true
  );
})();
