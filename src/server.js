const path = require('node:path');
const express = require('express');
const ticketsRouter = require('./routes/tickets');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false }));

app.use('/', ticketsRouter);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`社内ヘルプデスク: http://localhost:${port}`);
});
