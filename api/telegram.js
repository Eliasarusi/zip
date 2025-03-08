const TelegramBot = require('6686798170:AAFb9lQ9YeHaxW4hil_DV-QWhLlGFnHnz9c');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token);

// הגדרת כתובת ה-webhook בעזרת המשתנה VERCEL_URL (נדרש HTTPS)
const webhookUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}/api/telegram`
  : null;

if (webhookUrl) {
  bot
    .setWebHook(webhookUrl)
    .then(() => console.log('Webhook set to', webhookUrl))
    .catch(err => console.error('Failed to set webhook', err));
} else {
  console.error('VERCEL_URL is not defined');
}

// פונקציית API שתופסת עדכוני webhook
module.exports = (req, res) => {
  if (req.method === 'POST') {
    // עיבוד העדכון
    bot.processUpdate(req.body);
    res.status(200).end();
  } else {
    res.status(405).send('Method Not Allowed');
  }
};
