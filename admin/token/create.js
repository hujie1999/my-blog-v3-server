const jwt = require("jsonwebtoken")

const { preset } = require('./admintokensettings')

let createToken = (data)=>{
    let token = jwt.sign({
        //自定义保存内容
        data:data
    },preset.secret)

    return token;
}

module.exports = {
    createToken
}
