const express = require('express');
const bodyParser = require('body-parser');
const request = require('request-promise-native');
const utils = require('./utils');

const app = new express();

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

app.use('**/files', express.static(__dirname + '/files'));

app.get('/', (req, res) => {
  res.redirect('/files/index.html')
});

app.get('/auth', (req, res) => {
  if (!req.query.code) { // access denied
    return; // TODO: redirect somewhere
  }
  var data = {form: {
    client_id: process.env.SLACK_CLIENT_ID,
    client_secret: process.env.SLACK_CLIENT_SECRET,
    code: req.query.code
  }};
  request.post('https://slack.com/api/oauth.access', data, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      const jsonResponse = JSON.parse(body);
      console.log(jsonResponse);
      if (jsonResponse.ok) {
        // get tokens
        // create and save team creds
        // OAuth done- redirect the user to wherever
        res.redirect('/files/success.html');
      }
    }

    // TODO: something to return for failure
  })
});

app.post('/delete', async (req, res) => {
  try {
    const payload = JSON.parse(req.body.payload);
    const value = JSON.parse(payload.actions[0].value);
    let channel = value.channel || payload.channel.id;
    if (value.threaded_message_ts) {
      utils.deleteMessage(value.threaded_message_ts, channel)
    }
    const ok = await utils.deleteMessage(value.message_ts, channel);
    if (ok) {
      return res.status(200).send('Duplicate message deleted!');
    }
    return res.status(200).send('Could not delete duplicate message!');
  } catch (error) {
    return res.status(500).json(error);
  }
})

app.post('/message', async (req, res) => {
  res.header('Content-Type', 'application/x-www-form-urlencoded');
  // if Slack is "challenging" our URL in order to verify it
  if (req.body.challenge) {
    return res.status(200).json({ challenge: req.body.challenge });
  }
  return res.status(200).json({});
})

app.use('/redirect', (req, res) => {
  console.log('redirect url');
});

let server = app.listen(process.env.PORT || 5000, () => {
  let port = server.address().port;
  console.log(`Server started on port ${port}`)
})
