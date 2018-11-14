import 'babel-polyfill' // eslint-disable-line
import _ from 'lodash';
import crypto from 'crypto';
import dotenv from 'dotenv';
// import models from './models';
import request from 'request-promise-native';
import SlackBot from 'slackbots';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

/*
const bot = new SlackBot({
  token: // process.env.SLACK_BOT_TOKEN, 
  name: 'CopyCat'
});
bot.on('start', function() {
  console.log('Connection established with Slack!')
});

bot.on('message', async function(data) {
  try {
    if (data.type === 'message' && !data.thread_ts && !data.bot_id) {
      const allTeamCred = await models.TeamCred.findAll({});
      const existingTeamCred = await models.TeamCred.findOne({
        where: { teamId: data.team }
      });
      const messages = await utils.fetchMessagesFromChannel(data.channel, existingTeamCred);
      const matches = await utils.compareNewMessageToOldMessages(messages, existingTeamCred);
      if (matches.length > 0) {
        await utils.reportDuplicate(data.channel, matches[0], data, data.user, existingTeamCred);
      }
    }
  } catch (error) {
    console.log(error);
  }
});
*/

const utils = {
  compareNewMessageToOldMessages: async function(messages, teamCred) {
    let matches = [];
    if (messages.length < 2) {
      return matches;
    }
    const newMessage = messages[0];
    // get old messages
    // .filter(msg => (!msg.thread_ts && !msg.bot_id)): ignore threads and messages by bots
    // .slice(1): ignore the first message (which should be the new message)
    const oldMessages = messages.filter(msg => (!msg.thread_ts && !msg.bot_id)).slice(1);
    let i;
    // the branch ft-other-message-types uses filter here
    // it has been changed to good old for because:
    // 1. we are not interested in finding all matches; just finding one match is enough
    //    to show that a message is a duplicate. The for loop allows us to 'break' as soon
    //    as we find a find
    // 2. we can easily use async function 'utils.hashFile' in for (even if it's discouraged)
    for (i = 0; i < oldMessages.length; i++) { 
      const msg = oldMessages[i];
      // compare message text
      let match = (newMessage.text || '').toLowerCase() === (msg.text || '').toLowerCase();
      // compare metadata of message file
      if (newMessage.files && msg.files && match) { // no need entering this block if match is false
        // compare the metadata of their first files
        match = (newMessage.files[0].mimetype === msg.files[0].mimetype) &&
          (newMessage.files[0].size === msg.files[0].size);
      }
      if (newMessage.files && msg.files && match) { // no need entering this block if match is false
        // compare the hashes of the files
        const hash1 = await utils.hashFile(newMessage.files[0].url_private, teamCred);
        const hash2 = await utils.hashFile(msg.files[0].url_private, teamCred);
        match = hash1 === hash2;
      }

      if (match) {
        matches.push(msg);
        break;
      }
    }
    return matches;
  },
  deleteMessage: async function(message_ts, channel, teamCred) {
    let url = 'https://slack.com/api/chat.delete';
    const response = await request({
      url: url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      formData: {
        token: teamCred.userToken, // process.env.SLACK_USER_TOKEN,
        channel: channel,
        ts: message_ts
      },
      resolveWithFullResponse: true
    });
    const data = JSON.parse(response.body);
    return data.ok;
  },
  fetchMessagesFromChannel: async function(channel, teamCred) {
    let messages = [];
    let url = 'https://slack.com/api/conversations.history';
    url += '?channel=' + channel;
    url += '&token=' + teamCred.userToken; // process.env.SLACK_USER_TOKEN;
    const response = await request({
      url: url,
      method: 'GET',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      resolveWithFullResponse: true
    });
    const data = JSON.parse(response.body);
    if (data.ok && data.messages) {
      messages = data.messages;
    }
    return messages;
  },
  findUserById: async function(id, teamCred) {
    let url = 'https://slack.com/api/users.info';
    url += '?user=' + id;
    url += '&token=' + teamCred.userToken; // process.env.SLACK_USER_TOKEN;
    const response = await request({
      url: url,
      method: 'GET',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      resolveWithFullResponse: true
    });
    const data = JSON.parse(response.body);
    return data.user;
  },
  getMessagePermalink: async function(message, channel, teamCred) {
    let url = 'https://slack.com/api/chat.getPermalink';
    url += '?channel=' + channel;
    url += '&token=' + teamCred.botToken; // process.env.SLACK_BOT_TOKEN;
    url += '&message_ts=' + message.ts;
    const response = await request({
      url: url,
      method: 'GET',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      resolveWithFullResponse: true
    });
    const data = JSON.parse(response.body);
    return data.permalink;
  },
  hashFile: async function(url, teamCred) {
    let hash = '';
    const shasum = crypto.createHash('sha256');
    const response = await request({
      url: url,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + teamCred.botToken // process.env.SLACK_BOT_TOKEN
      },
      resolveWithFullResponse: true
    });
    shasum.update(response.body);
    hash = shasum.digest('hex')
    return hash;
  },
  reportDuplicate: async function(channelId, originalMsg, copyMsg, userId, teamCred) {
    const linkToOriginalMsg = await utils.getMessagePermalink(originalMsg, channelId, teamCred);
    const linkToCopyMsg = await utils.getMessagePermalink(copyMsg, channelId, teamCred);
    try {
      let threadedMsg = {};
      try {
        threadedMsg = await utils.reportDuplicateInChannelAsThread(channelId, originalMsg, copyMsg, userId, linkToOriginalMsg, linkToCopyMsg, teamCred);
      } catch (error) {
        threadedMsg = {};
      }
      await utils.reportDuplicateInChannelAsEphemeral(channelId, originalMsg, copyMsg, userId, linkToOriginalMsg, linkToCopyMsg, threadedMsg, teamCred);
    } catch (error) {
      await utils.reportDuplicateToUser(channelId, originalMsg, copyMsg, userId, linkToOriginalMsg, linkToCopyMsg, teamCred);
    }
  },
  reportDuplicateInChannelAsEphemeral: async function(channelId, originalMsg, copyMsg, userId, linkToOriginalMsg, linkToCopyMsg, threadedMsg, teamCred) {
    // post ephemeral message in channel, visible only to user
    const _bot = new SlackBot({
      token: teamCred.botToken, 
      name: 'CopyCat'
    });
    await _bot.postEphemeral(
      channelId,
      userId,
      "The message you just posted is a copy of a recent message in this channel!",
      {
        attachments: [{
          title: 'original post',
          // title_link: linkToOriginalMsg,
          text: linkToOriginalMsg
        }, {
          title: 'copy',
          // title_link: linkToCopyMsg,
          text: linkToCopyMsg,
          fallback: 'Could not delete duplicate post.',
          callback_id: 'delete_copy',
          actions: [{
            name: 'copy',
            text: 'Delete Copy',
            style: 'danger',
            type: 'button',
            value: JSON.stringify({
              message_ts: copyMsg.ts,
              threaded_message_ts: !(_.isEmpty(threadedMsg)) ? threadedMsg.ts : null
            })
          }]
        }]
      }
    );
  },
  reportDuplicateInChannelAsThread: async function(channelId, originalMsg, copyMsg, userId, linkToOriginalMsg, linkToCopyMsg, teamCred) {
    const _bot = new SlackBot({
      token: teamCred.botToken, 
      name: 'CopyCat'
    });
    const response = await _bot.postMessage(
      channelId,
      "This message is a copy of a recent message in this channel!",
      { 
        thread_ts: copyMsg.ts,
        attachments: [{
          title: 'original post',
          // title_link: linkToOriginalMsg,
          text: linkToOriginalMsg
        }]
      }
    );
    return response.message;
  },
  reportDuplicateToUser: async function(channelId, originalMsg, copyMsg, userId, linkToOriginalMsg, linkToCopyMsg, teamCred) {
    const user = await utils.findUserById(userId, teamCred);
    // user can be undefined
    if (user && user.name) {
      const _bot = new SlackBot({
        token: teamCred.botToken, 
        name: 'CopyCat'
      });
      await _bot.postMessageToUser(
        user.name,
        "The message you just posted is a copy of a recent message in the channel!",
        {
          attachments: [{
            title: 'original post',
            // title_link: linkToOriginalMsg,
            text: linkToOriginalMsg
          }, {
            title: 'copy',
            // title_link: linkToCopyMsg,
            text: linkToCopyMsg,
            fallback: 'Could not delete duplicate post.',
            callback_id: 'delete_copy',
            actions: [{
              name: 'copy',
              text: 'Delete Copy',
              style: 'danger',
              type: 'button',
              value: JSON.stringify({ channel: channelId, message_ts: copyMsg.ts })
            }]
          }]
        }
      );
    }
  }
}

module.exports = utils;
