const jwt = require("jsonwebtoken")
const { preset } = require('./tokensettings')
// const { varifyToken } = require('./verify')
const { createToken } = require('./create')
const check = (req,res,next)=>{
    // console.log('user 的 check 方法')
    if(req.url == '/login' ||
        req.url == '/register'||
        req.url == '/refeshtoken'
        ){
        next()
        return
    }
    const token = req.headers.authorization
    let presend = {}
    if(token!=undefined && token){
        try {
            const { 
                create_time,
                    refresh_time,
                    access_time,
                    forbidden_time 
                } = jwt.verify(token,preset.secret).data
            // console.log('decoded------>',decoded)
            const now = Math.floor(Date.now()/1000)
            if(now<=access_time){
                //token 有效期未超过最大时长
                if(now<=create_time+refresh_time){
                    //未过期
                    next()
                }
                else{
                    //过期  重新颁发token,判定是否在不禁用间隔内
                    if(now>=create_time+forbidden_time){
                        //超过不禁用间隔，需要重新登录
                        // console.log('token超过不禁用间隔，需要重新登录')
                        presend.msg = 'token超过不禁用间隔，需要重新登录'
                        presend.code = 2001
                        res.send(presend)               
                        return 
                    }else{
                        //未超过，为其重新颁发token
                        // console.log('token过期了，需要重新颁发token')
                        presend.msg = 'token过期，待更新'
                        presend.code = 2004
                        res.send(presend)               
                        return 
                    }                 
                }
            }else{
                //token有效期超过最大有效时长
                // console.log('token有效期超过最大时长,需要重新登录')
                presend.msg = 'token有效期超过最大时长,需要重新登录'
                presend.code = 2001
                res.send(presend)               
                return 
            }
        } catch (e) {
            // console.log(e)
            presend.msg = 'token非法,需重新登录'
            presend.code = 2002
            presend.err = e
            res.send(presend)  
            return
        }  
    }else{
        //无token (游客登录)
        next()
    }
}


module.exports = {
    check
};
