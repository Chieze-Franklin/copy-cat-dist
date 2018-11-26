import 'babel-polyfill' // eslint-disable-line
import express from 'express';
import exphbs from 'express-handlebars';
import bodyParser from 'body-parser';
import request from 'request-promise-native';
import url from 'url';

import models from './models';
import utils from './utils';

const app = new express();

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

app.use('/assets', express.static(__dirname + '/assets'));

app.set('views', __dirname + '/views');
app.engine('html', exphbs.create({
  defaultLayout: 'main.html',
  layoutsDir: app.get('views') + '/layouts',
  partialsDir: [app.get('views') + '/partials']
}).engine);
app.set('view engine', 'html');

/**
 * This UI endpoint renders the landing page
 */
app.get('/', async (req, res) => {
  const result = await models.TeamCred.findAndCountAll({ limit: 10 });
  const teams = result.rows.map(row => {
    return {
      teamName: row.dataValues.teamName,
      teamUrl: row.dataValues.teamUrl
    }
  });
  res.render('index.html', {
    slack_button_href: 'https://slack.com/oauth/authorize?scope=channels:history,channels:read,channels:write,chat:write:bot,groups:history,groups:read,groups:write,incoming-webhook,mpim:history,mpim:read,mpim:write,files:read,bot,users:read&client_id=258316641222.456711531815',
    teams,
    teamsCount: result.count
  });
});

/** 
 * This UI endpoint handles authentication
*/
app.get('/auth', async (req, res) => {
  if (!req.query.code || req.query.error) { // req.query.error==='access_denied'
    return res.render('failure.html', { message: 'Authentication failed!' });
  }
  try {
    const response = await request({
      url: 'https://slack.com/api/oauth.access',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      formData: {
        client_id: process.env.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET,
        code: req.query.code
      },
      resolveWithFullResponse: true
    });
    const jsonResponse = JSON.parse(response.body);
    if (jsonResponse.ok) {
      // get tokens and other data
      const botId = jsonResponse.bot.bot_user_id;
      const botToken = jsonResponse.bot.bot_access_token;
      const teamId = jsonResponse.team_id;
      const teamName = jsonResponse.team_name;
      const userId = jsonResponse.user_id;
      const userToken = jsonResponse.access_token;
      const rawUrl = jsonResponse.incoming_webhook.configuration_url;
      const urlObject = url.parse(rawUrl);
      // create and save team creds
      const teamCred = await models.TeamCred.upsert({
        botId,
        botToken,
        teamId,
        teamName,
        teamUrl: `https://${urlObject.host}`,
        userId,
        userToken
      });
      return res.render('success.html');
    } else {
      throw new Error('CopyCat could not be installed in your workspace.');
    }
  } catch (error) {
    return res.render('failure.html', { message: error.message });
  }
});

/** 
 * The endpoint is POSTed to when a user clicks on the 'Delete' button
 * in order to delete a message
*/
app.post('/delete', async (req, res) => {
  try {
    const payload = JSON.parse(req.body.payload);
    const value = JSON.parse(payload.actions[0].value);
    let channel = value.channel || payload.channel.id;
    const existingTeamCred = await models.TeamCred.findOne({
      where: { teamId: payload.team.id }
    });
    if (value.threaded_message_ts) {
      utils.deleteMessage(value.threaded_message_ts, channel, existingTeamCred)
    }
    const ok = await utils.deleteMessage(value.message_ts, channel, existingTeamCred);
    if (ok) {
      return res.status(200).send('Duplicate message deleted!');
    }
    return res.status(200).send(
      'Could not delete duplicate message!\n' +
      'This may happen if CopyCat was installed\n' +
      'by a user who is not an Admin of this workspace.'
    );
  } catch (error) {
    return res.status(500).json(error);
  }
})

/** 
 * The endpoint is POSTed to when certain events (like a user posted a message)
 * occur.
*/
app.post('/message', async (req, res) => {
  res.header('Content-Type', 'application/x-www-form-urlencoded');
  // if Slack is "challenging" our URL in order to verify it
  if (req.body.challenge) {
    return res.status(200).json({ challenge: req.body.challenge });
  } else {
    try {
      const data = req.body.event;
      const isUrl = data.text.startsWith('<http') && data.text.endsWith('>');
      if (data.type === 'message' && isUrl && !data.thread_ts && !data.bot_id) {
        const existingTeamCred = await models.TeamCred.findOne({
          where: { teamId: req.body.team_id }
        });
        const messages = await utils.fetchMessagesFromChannel(data.channel, existingTeamCred);
        const matches = await utils.compareNewMessageToOldMessages(messages, existingTeamCred);
        if (matches.length > 0) {
          await utils.reportDuplicate(data.channel, matches[0], data, data.user, existingTeamCred);
        }
      }
      return res.status(200).json({});
    } catch (error) {
      return res.status(500).json(error);
    }
  }
})

let server = app.listen(process.env.PORT || 5000, () => {
  let port = server.address().port;
  console.log(`Server started on port ${port}`)
})
