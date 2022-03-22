const express = require("express");
const app = express();

app.get("/", function (req, res) {
    res.sendFile("home.html", {root: __dirname + "/"});
});

app.listen(3000, function () {
    console.log("listening on port 3000!");
});