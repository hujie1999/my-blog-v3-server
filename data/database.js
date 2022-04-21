let mysql = require('mysql')

const db = mysql.createConnection({
        host: "localhost",
        port: 3306,
        user: "root",
        password: "",
        database: "my_blog"
    })


module.exports = {
    db
}