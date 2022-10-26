const express = require('express')
const app = express()
const http = require('http')
const https = require('https')
const fs = require('fs')
const bodyParser = require('body-parser')
const { timerTask } = require('./utils/autoExec')
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
    // res.header("Access-Control-Allow-Origin", allowedItem(origin));
    res.header("Access-Control-Allow-Origin", "*");
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

//访问数据处理
const touristSet = new Set(); //游客访问人数
const userSet = new Set(); //注册用户访问数

app.use((req, res, next) => {
    const personInfo = {
        islogin : req.body.islogin || req.query.islogin,
        uniqueid : req.body.uniqueid || req.query.uniqueid
    }
    //登录用户
    if(personInfo.islogin=='true'){
        userSet.has(personInfo.uniqueid)?'':userSet.add(personInfo.uniqueid)
    }
    if(personInfo.islogin=='false'){
        //游客
        touristSet.has(personInfo.uniqueid)?'':touristSet.add(personInfo.uniqueid)
    }
    // console.log('userSet :>> ', userSet);
    // console.log('touristSet :>> ', touristSet);
    next()
})

const ssl_options = {
    key:fs.readFileSync('./ssl/7227560_xiaohai-learn.pub.key'),
    cert:fs.readFileSync('./ssl/7227560_xiaohai-learn.pub.pem')
}
app.use('/api/admin',admin)
app.use('/api/user',user)


http.createServer(app).listen(8889)
// https.createServer(ssl_options,app).listen(8890)
console.log('HTTP server is running,The port is 8889')
// console.log('HTTPS server is running,The port is 8890')


//定时处理存储 访问数据
timerTask(userSet,touristSet)









