import axios from 'axios';

const key = process.env.TRELLO_KEY;
const token = process.env.TRELLO_TOKEN;
const cardId = process.env.TRELLO_CARD_ID;

const message = process.env.TRELLO_MESSAGE;

if (!key || !token || !cardId || !message) {
  console.error('Missing required env vars: TRELLO_KEY, TRELLO_TOKEN, TRELLO_CARD_ID, TRELLO_MESSAGE');
  process.exit(1);
}

await axios.post(
  `https://api.trello.com/1/cards/${cardId}/actions/comments?key=${key}&token=${token}`,
  { text: message }
);

console.log('Comment added');
