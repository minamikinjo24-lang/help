const path = require('node:path');
const express = require('express');
const cookieSession = require('cookie-session');

const config = require('./config');
config.assertAuthEnv();

const authRouter = require('./routes/auth');
const requireLogin = require('./middleware/requireLogin');
const ticketsRouter = require('./routes/tickets');
const apiTicketsRouter = require('./routes/api/tickets');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use(
  cookieSession({
    name: 'helpdesk_session',
    keys: [config.sessionSecret],
    maxAge: 8 * 60 * 60 * 1000, // 1営業日
    httpOnly: true,
    sameSite: 'lax',
    secure: config.baseUrl.startsWith('https://'),
  })
);

// 認証に関する経路はログイン不要。先に登録する。
app.use('/', authRouter);

// ここから先はログインが必要。
app.use('/api/tickets', requireLogin, apiTicketsRouter);
app.use('/', requireLogin, ticketsRouter);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`社内ヘルプデスク: http://localhost:${port}`);
});
