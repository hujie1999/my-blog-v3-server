const express = require('express')
const app = express()
const http = require('http')
const https = require('https')
const fs = require('fs')
const bodyParser = require('body-parser')

const user = require('./user/user')
const admin = require('./admin/admin')

const allowOrigin = [
    // "http://127.0.0.2:8084",
    // "http://127.0.0.3:8085",
    "http://xiaohai-learn.pub",
    "http://www.xiaohai-learn.pub",
    "http://admin.xiaohai-learn.pub",
    "http://server.xiaohai-learn.pub",
    "https://xiaohai-learn.pub",
    "https://www.xiaohai-learn.pub",
    "https://admin.xiaohai-learn.pub",
    "https://server.xiaohai-learn.pub",
];

const allowedItem = (origin)=>{
    if(allowOrigin.includes(origin)){
        return origin
    }
    return ''  
}
//设置跨域访问
app.all('*', function (req, res, next) {
    let origin = req.headers.origin
    res.header("Access-Control-Allow-Origin", allowedItem(origin));
    res.header("Access-Control-Allow-Credentials", true);
    res.header("Access-Control-Allow-Headers", "Content-Type, Content-Length, Authorization, Accept, X-Requested-With");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, HEAD, DELETE, OPTIONS");
    res.header("Access-Control-Max-Age",1728000);
    res.header("X-Powered-By", "3.2.1");
    if(req.method.toUpperCase() == "OPTIONS") {
        res.statusCode=200
    }

    next();
    
})
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended: true})) //解析post数据
app.use(express.static('public'))

let ssl_options = {
    key:fs.readFileSync('./ssl/7227560_xiaohai-learn.pub.key'),
    cert:fs.readFileSync('./ssl/7227560_xiaohai-learn.pub.pem')
}
app.use('/api/admin',admin)
app.use('/api/user',user)


http.createServer(app).listen(8889,'0.0.0.0')
https.createServer(ssl_options,app).listen(8890)
console.log('HTTP server is running,The port is 8889')
console.log('HTTPS server is running,The port is 8890')











