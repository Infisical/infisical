const core = require("@actions/core");
const slackApi = require("@slack/web-api");

function parseChannels(channels) {
  const channelIds = channels.map((ch, idx, arr) => {
    return ch.id;
  });
  return channelIds;
}

async function postMessages(slackClient, channels, msg) {
  const results = [];

  try {
    const msgObj = JSON.parse(msg);
    for (var chan of channels) {
      const chatPostArgs = {
        channel: chan,
        ...msgObj,
      };
      const res = await slackClient.chat.postMessage(chatPostArgs);
      results.push(res.ok);
    }
  } catch (err) {
    core.error(err);
  }

  return results;
}

async function action() {
  //get slack bot token
  try {
    //inputs
    const botToken = core.getInput("BOT_TOKEN");
    if (!botToken) {
      throw "Slack bot token not provided";
    }

    const msg = core.getInput("MESSAGE");
    if (!msg) {
      throw "Message not provided";
    }

    //slack client
    const client = new slackApi.WebClient(botToken);

    //fetch all bot channels
    const channels = await client.users.conversations();
    if (!channels.ok) {
      throw "Error in fetching your bots slack channels";
    }

    //use only ids
    const channelIds = parseChannels(channels.channels);

    //broadcast message to all channels
    const msgResp = await postMessages(client, channelIds, msg);
    console.log(msgResp);
  } catch (err) {
    console.log(err);
    core.error(err);
  }
}

action();
