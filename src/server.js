const express = require('express');
const app = express();

app.get('/', function (req, res) {
  res.send('Hello World');
});

const PORT = process.env.PORT;
if(!PORT) {
  throw new Error("PORT environment variable not set");
}

const server = app.listen(process.env.PORT, function () {
  console.log("Node.js sample app is running");
});
