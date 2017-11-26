const express = require('express')
const app = express()
require('dotenv').config()
const CronJob = require('cron').CronJob;
const steem = require('steem');
const request = require('request');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {polling: true});

// Paths
const IMG_PATH = process.env.IMG_PATH;
const STORY_PATH = process.env.STORY_PATH;

// Listen for any kind of message.
bot.on('message', (msg) => {
	if (msg.text.toString().toLowerCase().includes('/'+process.env.TELEGRAM_BOT_COMMAND)) {
		fs.readdir(IMG_PATH, (err, files) => {
			bot.sendMessage(msg.chat.id, 'My ready posts: ' + files.length);
		});
	}
	if (msg.text.toString().toLowerCase().includes('/voting_power')) {
		steem.api.getAccounts(['neronius'], function(err, result) {
			var secondsago = (new Date - new Date(result[0].last_vote_time + "Z")) / 1000;
		    var vpow = result[0].voting_power + (10000 * secondsago / 432000);
	        vpow = Math.min(vpow / 100, 100).toFixed(2);
			bot.sendMessage(msg.chat.id, 'My current voting power: ' + vpow + '%');
		});
	}
	if (msg.text.toString().toLowerCase().includes('/money')) {
		steem.api.getAccounts(['lino'], function(err, result) {
			bot.sendMessage(msg.chat.id, result[0].balance + " " + result[0].sbd_balance);
		});
	}
});


function generatePost() {

	// list files in images folder
	fs.readdirSync(IMG_PATH).forEach(filename => {
  	console.error("[neronius-bot] try file: " + filename);

		// remove the extension
		rootFilename = filename.replace(/\.[^/.]+$/, "")
	  
	  // read story file with the same name of image
	  fs.readFile(STORY_PATH + rootFilename + '.txt', 'utf8', function(err, data) {
		  if (err) {
		  	console.error("[neronius-bot] missing story");
		  	// remove the image without associated story
		  	fs.unlink(IMG_PATH + filename, function(err, data) {
		  		console.log("[neronius-bot] file removed: " + filename);
		  		// retry
			  	generatePost();
		  	});
		  } else {
			  getPostContent(rootFilename, data, filename);
		  }
		});
	})
}

function getPostContent(title, story, image) {
	var url = "https://pictshare.net/backend.php";

	var formData = {
	  postimage: fs.createReadStream(IMG_PATH + image)
	};

	// upload image on pictshare
	request.post({url:url, formData: formData}, function optionalCallback(err, httpResponse, body) {
	  if (err) { return console.error('[neronius-bot] image upload failed: ' + image); }
	  var parsed = JSON.parse(body);
	  var url = parsed.domain + '/' + parsed.hash;
	  console.log('[neronius-bot] image ' + image + ' uploaded to ' + url);
	  createPost(title, story, url);
	});
}

function createPost(title, story, urlImage) {
	content = "<center>![]("+urlImage+")</center> \n\n " + story + ' \n\n --- \n\n This post is made by an artifical intelligence called Neronius';
	broadcastPost(title, content);
}

function broadcastPost(title, content) {
  /** Broadcast a post */
  var permlink = new Date().toISOString().replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
  const postLink = permlink + '-post';
  steem.broadcast.comment(
    process.env.AUTHOR_POSTING_WIF,
    '', // Leave parent author empty
    'neronius', // Main tag
    process.env.AUTHOR_USERNAME, // Author
    postLink, // Permlink
    title, // Title
    content, // Body
    { tags: ['story', 'technology', 'neural-network', 'ai'], app: 'steemjs/examples' }, // Json Metadata
    function(err, result) {
    	if (err) { return console.error('[neronius-bot] error broadcast post') }
		  console.log('[neronius-bot] post uploaded: ' + postLink);
			sendMessage(postLink);
      votePost(postLink);
			removeFiles(title);
    }
  );
};

function sendMessage(link) {
	var postLink = "https://steemit.com/neronius/@" + process.env.AUTHOR_USERNAME + '/' + link;
	bot.sendMessage(process.env.TELEGRAM_CHAT_ID, 'New post! ' + postLink);
}

function removeFiles(name) {
	fs.unlinkSync(IMG_PATH + name + '.jpg');
	fs.unlinkSync(STORY_PATH + name + '.txt');
};

function votePost(link) {
	// Vote post
	steem.broadcast.vote(
    process.env.AUTHOR_POSTING_WIF,
    process.env.AUTHOR_USERNAME, // Voter
    process.env.AUTHOR_USERNAME, // Author
    link, // Permlink
    10000, // Weight (10000 = 100%)
    function(err, result) {
    	if (err) { return console.error('[neronius-bot] error vote post') }
		  console.log("[neronius-bot] post upvoted");
    }
  );
};

// 0 a.m.
new CronJob('0 0 0 * * *', function() {
  console.log('[neronius-bot] post at 0 a.m.');
	generatePost();
}, null, true, 'Europe/Rome');

// 2 a.m.
new CronJob('0 0 2 * * *', function() {
  console.log('[neronius-bot] post at 2 a.m.');
	generatePost();
}, null, true, 'Europe/Rome');

// 4 a.m.
new CronJob('0 0 4 * * *', function() {
  console.log('[neronius-bot] post at 4 a.m.');
	generatePost();
}, null, true, 'Europe/Rome');

// 6 a.m.
new CronJob('0 0 6 * * *', function() {
  console.log('[neronius-bot] post at 6 a.m.');
	generatePost();
}, null, true, 'Europe/Rome');

// 8 a.m.
new CronJob('0 0 8 * * *', function() {
  console.log('[neronius-bot] post at 8 a.m.');
	generatePost();
}, null, true, 'Europe/Rome');

// 0 p.m.
new CronJob('0 0 12 * * *', function() {
  console.log('[neronius-bot] post at 0 p.m.');
	generatePost();
}, null, true, 'Europe/Rome');

// 2 p.m.
new CronJob('0 0 14 * * *', function() {
  console.log('[neronius-bot] post at 2 p.m.');
	generatePost();
}, null, true, 'Europe/Rome');

// 4 p.m.
new CronJob('0 0 16 * * *', function() {
  console.log('[neronius-bot] post at 4 p.m.');
	generatePost();
}, null, true, 'Europe/Rome');

// 6 p.m.
new CronJob('0 0 18 * * *', function() {
  console.log('[neronius-bot] post at 6 p.m.');
	generatePost();
}, null, true, 'Europe/Rome'); 

// 8 p.m.
new CronJob('0 0 20 * * *', function() {
  console.log('[neronius-bot] post at 8 p.m.');
	generatePost();
}, null, true, 'Europe/Rome');

app.listen(2345, () => console.log('Neronius listening on port 2345!'))
