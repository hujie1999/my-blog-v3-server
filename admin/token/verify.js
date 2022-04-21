const jwt = require("jsonwebtoken")
const { preset } = require('./admintokensettings')
let varifyToken = (token)=>{//验证token是否合法的方法
    return jwt.verify(token,preset.secret)
}

module.exports = {
    varifyToken
}