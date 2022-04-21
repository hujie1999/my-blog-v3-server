const jwt = require("jsonwebtoken")

const { preset } = require('./tokensettings')

let createToken = (data)=>{

    let token = jwt.sign({
        //签发时间
        // iat : Math.floor(Date.now()/1000),
        //自定义保存内容
        data:data
    },preset.secret)

    return token;
}

module.exports = {
    createToken
}
