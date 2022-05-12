const express = require('express')
const user = express.Router()

let { db } = require('../data/database')

let { uniqueArray } = require('../utils/uniquearray')
let { createToken } = require('./token/create')
let { varifyToken } = require('./token/verify')
let { check } = require('./token/check')
const { randomId } = require('../utils/randomid')
const { preset } = require('./token/tokensettings')

//链式调用 db.query 方法
const chainFecth = function(s,i){
    return new Promise((resolve,reject)=>{
        db.query(s,i,(err,data)=>{
            if(data){
                resolve(data) 
            }
            else{
                reject(err)
            }
        })
    })
}
user.use((req, res, next) => {
    check(req, res, next)
})

user.post('/test', (req, res) => {
    res.send('ok')
})
// 登录
user.post('/login', (req, res) => {
    let account = req.body.acc
    let password = req.body.pwd

    let resinfo = {} 
    sql = 'select * from user_table where User_Account = ? and User_Password = ?'
    chainFecth(sql,[account, password])
    .then(data=>{
        // console.log(data)
        


        if (data.length == 1) {
            const User_Status = data[0].User_Status
            const User_Examined = data[0].User_Examined

            if(User_Status==2){
                // 被冻结
                resinfo.msg = '登陆失败,账号被冻结'
                resinfo.code = 1003
                res.send(resinfo)
            }else if(User_Status==0){
                //被删除
                resinfo.msg = '登陆失败,账号已被删除'
                resinfo.code = 1004
                res.send(resinfo)
            }else if(User_Status==1){
                //正常
                // if(User_Examined==0){
                //     //正在审核
                //     resinfo.msg = '登陆失败,账号正在审核'
                //     resinfo.code = 1005
                //     res.send(resinfo)
                // }
                if(User_Examined==2){
                    //未过审
                    resinfo.msg = '登陆失败,账号未通过审核'
                    resinfo.code = 1006
                    res.send(resinfo)
                }
                else if(User_Examined == 1 || User_Examined == 0){
                    
                    let params = {
                        uniqueid: data[0]['User_UniqueId'],
                        create_time : Math.floor(Date.now()/1000),
                        refresh_time : preset.refresh_time,
                        access_time :Math.floor(Date.now()/1000+(preset.access_time)),
                        forbidden_time : preset.forbidden_time
                    }
                    let token = createToken(params)
                    resinfo.msg = '登陆成功'
                    resinfo.code = 1000
                    resinfo.role = data[0]['Role']
                    resinfo.nickname = data[0]['User_Nickname'],
                    resinfo.account = data[0]['User_Account'],
                    resinfo.uniqueid = data[0]['User_UniqueId'],
                    resinfo.avatar = data[0]['User_Avatar'],
                    resinfo.token = token
        
                    res.send(resinfo)

                }
            }

            
        } else if (data.length == 0) {
            resinfo.msg = '登陆失败,账号密码不匹配'
            resinfo.code = 1002
            res.send(resinfo)
        }
    })
    .catch(err=>{
        resinfo.msg = '出错了！'
        resinfo.code = 1001
        resinfo.err =err
        res.send(resinfo)
    })

})
//注册
user.post('/regist', (req, res) => {
    let nickname = req.body.userinfo.nick
    let account = req.body.userinfo.acc
    let password = req.body.userinfo.pwd
    let email = req.body.userinfo.email
    let pwdcheck = req.body.userinfo.pwdcheck
    let user_uniqueid = randomId(16)

    let reg = new RegExp("^[A-Za-z0-9]+$");
    if(nickname.length>15 ||nickname.length<1 || nickname.includes(' ')){
        res.send({
            msg:'昵称格式或长度不合法!',
            code:1022
        })
        return
    }
    
    if(account.length<6 || account.length>15 ||!reg.test(account)){
        res.send({
            msg:'账号格式或长度不合法!',
            code:1023
        })
        return
    }
    if(password.length<6 || password.length>20 ||!reg.test(password) ||password!=pwdcheck){
        res.send({
            msg:'密码格式或长度不合法!',
            code:1024
        })
        return
    }
    if(email.length<8 || email.length>30){
        res.send({
            msg:'邮箱格式或长度不合法!',
            code:1025
        })
        return
    }

    let outsql = 'select count(*) as count from user_table where User_Account=?'
    chainFecth(outsql,account)
    .then(data=>{
        if(data[0].count == 1){
            // console.log('该账号已存在！')
            res.send({
                msg:'该账号已存在！',
                code:'1026'
            })
            return
        }
        else if(data[0].count == 0){
           
            let sql = 'insert into user_table (User_UniqueId,User_Nickname,User_Account,User_Password,User_Email) values '+
            '(?,?,?,?,?)'
            let mix = [
                user_uniqueid,
                nickname,
                account,
                password,
                email
            ]
            chainFecth(sql,mix).then(data=>{
                res.send({
                    msg:'注册成功！',
                    code:1020,
                    resultMsg:data
                })
                return
                
            }).catch(err=>{
                res.send({
                    msg:'注册失败！',
                    code:1021,
                    errMsg:err
                })
            })

        }
        
        
    })
    .catch(err=>{
        console.log(err)
        res.send(err)
    })
    
    
})
//刷新 token
user.post('/refeshtoken', (req, res) => {
    // console.log('刷新token接口调用')
    const old_token = req.headers.authorization
    let decoded = {}
    try {
        decoded = varifyToken(old_token).data
    } catch (error) {
        res.send({
            msg:'旧token解析失败',
            code:2002,
            errmsg:error
        })
        
        return
    }
    // console.log(decoded)
    let new_token = createToken({
        uniqueid: decoded.uniqueid,
        create_time : Math.floor(Date.now()/1000),
        refresh_time : preset.refresh_time,
        // access_time : decoded.access_time,
        access_time : Math.floor(Date.now()/1000+(preset.access_time)),
        forbidden_time : preset.forbidden_time
    })
    res.send({
        new_token:new_token,
        msg:'生成新token成功',
        code:2005
    })
    
})
//博客列表
user.post('/blogslist', (req, res) => {
    let st = Number(req.body.start)
    let len = Number(req.body.length)
    // let sql = '(select * from blogs where Blog_Status=1 order by Blog_Id desc)  limit ?,?'
    let sql = '(select Blog_Id,Blog_Title,Blog_Summary,Blog_Tags,Blog_Class,'+
    'Blog_Likes,Blog_Views,Blog_Collected,Blog_Comments,Blog_Author,Blog_Createtime,Blog_Updatetime '
    +' from blogs where Blog_Status=1 order by Blog_Id desc)  limit ?,?'
    chainFecth(sql,[st,len]).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})
//博客列表count
user.get('/blogslistcount', (req, res) => {
    let sql = 'select count(*) as count from blogs where Blog_Status = 1'
    chainFecth(sql).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})
//根据Blog_Id搜索博客 
user.post('/takeablog', (req, res) => {
    let Blog_Id = Number(req.body.Blog_Id)
    if(Blog_Id>99999 || Blog_Id <9999 || Blog_Id==undefined || Blog_Id==''||Blog_Id==NaN || Blog_Id==null){
        console.log('/takeablog-> illegal param!')
        res.send([])
        return
    }
    // let sql = 'select *from blogs where Blog_Id=? and Blog_Status=1'
    let sql = 'select Blog_Id,Blog_Title,Blog_Content,Blog_Tags,Blog_Class,Blog_Likes,'+
    'Blog_Views,Blog_Collected,Blog_Comments,Blog_Author_Role,Blog_Author_UniqueId,Blog_Author,'+
    'Blog_Author_Account,Blog_Author_Avatar,Blog_Createtime,Blog_Updatetime'+
    ' from blogs where Blog_Id=? and Blog_Status=1'
    chainFecth(sql,Blog_Id).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})
//获取 Blog_Id 对应的评论
user.post('/blogcomments', (req, res) => {
    let Blog_Id = req.body.Blog_Id
    let st = Number(req.body.Start)
    let ln = Number(req.body.Length)
    //先获取第一层评论
    sql = '(select * from comments_blogs where Blog_Id = ? and Comment_Examined !=2 and Comment_Level=1  order by Id desc )limit ?,?'
    chainFecth(sql,[Blog_Id,st,ln])
    .then(data=>{
        
        let first = data
        let actions = []
        //存储用户信息
        // let userinfo = {}
        //根据UniqueId搜索用户信息并添加到每一层评论
        // let userinfosql = 'SELECT User_Nickname,User_Account,User_Avatar,Role FROM user_table WHERE User_UniqueId=?'
        
        //在根据commentid 循环查询所对应的二级回复
        let innersql = 'select * from comments_blogs where Root_Comment_Id = ? and Comment_Examined !=2'
        first.forEach((v,index)=>{
            if(v.Comment_Status==0){
                v.Comment_Content = '该评论已被删除'
            }
            else if(v.Comment_Status==2){
                v.Comment_Content = '该评论已被冻结'
            }
            
            
            var action = ()=>{
                return new Promise((resolve,reject)=>{
                    chainFecth(innersql,v.Comment_Id).then(dt=>{
                        //为 一级回复新建 reply 属性保存 二级回复
                        v.reply = Object.assign(dt)
                        resolve()
                    }).catch(err=>{
                        reject(err)
                    })
                })
            }
            actions.push(action())
        })

        Promise.all(actions).then(resp=>{
            // console.log('done!')
            res.send(first)
        }).catch(error=>{
            console.log(error)
        })
    })
    .catch(err=>{
        console.log(err)
    })
})
//获取 Blog_Id 对应的count
user.post('/blogcommentscount', (req, res) => {
    Blog_Id = req.body.Blog_Id
    let sql = 'select count(*) as count from comments_blogs where Blog_Id = ? and Comment_Examined !=2 and Comment_Level=1'
    let sql2 = 'select count(*) as count from comments_blogs where Blog_Id = ? and Comment_Examined !=2'
    chainFecth(sql,Blog_Id).then(data=>{
        chainFecth(sql2,Blog_Id).then(dt=>{
            res.send({
                total:data[0].count,
                all:dt[0].count
            })
        }).catch(error=>{console.log(error)})
    }).catch(err=>{console.log(err)})
})





//获取分类列表
user.get('/classlist', (req, res) => {
    sql = 'select Class_List from website'
    chainFecth(sql).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})
//根据分类名称检索博客
user.post('/getblogbyclass', (req, res) => {
    let Blog_Class = req.body.Blog_Class
    let start = Number(req.body.Start)
    let length = Number(req.body.Length)
    // sql = "(select *from blogs where locate(?,Blog_Class) order by Blog_Id desc)limit ?,?"
    sql = "(select *from blogs where Blog_Class=? and Blog_Status=1  order by Blog_Id desc)limit ?,?"
    chainFecth(sql,[Blog_Class, start, length]).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})
//根据分类名称检索博客count
user.post('/getblogbyclasscount', (req, res) => {
    let Blog_Class = req.body.Blog_Class
    sql = 'select count(*) as count from blogs where Blog_Status = 1 and Blog_Class =?'
    chainFecth(sql,Blog_Class)
    .then(data=>{
        res.send(data)
    })
    .catch(err=>{
        console.log(err)
    })
})
//搜索博客
user.post('/searchblogs', (req, res) => {
    let limiter = Number(req.body.limiter)
    let keywords = req.body.keywords
    let needlength = Number(req.body.needlength)
    let initend = Number(req.body.initend)

    let arr = Object.values(keywords.split('*'))
    let sql = ''
    
    let temp = []
    let result = []
    let actions = []
    const row_names = 'Blog_Id,Blog_Title,Blog_Summary,Blog_Tags,Blog_Class,Blog_Likes,Blog_Views,Blog_Collected,Blog_Comments,Blog_Author,Blog_Createtime,Blog_Updatetime'
    arr.forEach(v=>{
        if (initend == 0) {   
            sql = '(SELECT '+ row_names +' FROM `blogs` WHERE Blog_Id>' + limiter + ' AND Blog_Status=1 AND (Blog_Tags LIKE "%' + v + '%" OR Blog_Title LIKE "%' + v + '%" OR Blog_Summary LIKE "%' + v + '%") ORDER BY Blog_Id DESC) LIMIT ' + needlength + ''
        } else if (initend == 1) {
            sql = '(SELECT '+ row_names +' FROM `blogs` WHERE Blog_Id<' + limiter + ' AND Blog_Status=1 AND (Blog_Tags LIKE "%' + v + '%" OR Blog_Title LIKE "%' +v + '%" OR Blog_Summary LIKE "%' + v + '%") ORDER BY Blog_Id DESC) LIMIT ' + needlength + ''
        }
        var action = ()=>{
            return new Promise((resolve,reject)=>{
                chainFecth(sql).then(data=>{
                    temp = temp.concat(data)
                    resolve()
                })
                .catch(err=>{
                    reject(err)
                })
            })
        }
        actions.push(action())
    })
    Promise.all(actions).then(resp=>{

        result = uniqueArray(temp) //去重，排序
            if (result.length == 0) {
                let presend = {
                    msg: '查询完成，没有结果',
                    limiter: 0,
                    code: 400,
                    list: []
                }
                res.send(presend)

            } else if (result.length < needlength) {
                let id = result[result.length - 1]['Blog_Id']
                let presend = {
                    msg: '查询完成，未达到规定的条数',
                    limiter: id,
                    code: 300,
                    list: result
                }
                res.send(presend)

            } else if (result.length > needlength) {
                let newtemp = result.slice(0, needlength)
                let id = newtemp[newtemp.length - 1]['Blog_Id']
                let presend = {
                    msg: '查询成功',
                    code: 200,
                    limiter: id,
                    list: newtemp,
                }
                res.send(presend)
            } else if(result.length == needlength) {
                let id = result[needlength - 1]['Blog_Id']
                let presend = {
                    msg: '查询成功',
                    code: 100,
                    limiter: id,
                    list: result
                }
                res.send(presend)
            }

    }).catch(error=>{
        console.log(error)
    })

})
//符合条件博客数量
user.post('/searchblogscount', (req, res) => {
    let keywords = req.body.keywords

    let arr = Object.values(keywords.split('*'))
    let temp = []
    let myData = arr;
    let f1 = function (i) {
        return new Promise(function (resolve, reject) {
            let sql = 'SELECT Blog_Id FROM `blogs` WHERE  Blog_Status=1 AND (Blog_Tags LIKE "%' + myData[i] + '%" OR Blog_Title LIKE "%' + myData[i] + '%" OR Blog_Summary LIKE "%' + myData[i] + '%")'
            db.query(sql, (err, data) => {
                if (err) {
                    console.log(err)
                } else {
                    temp = temp.concat(data)
                    resolve()
                }
            })
        });
    };
    let loopNum = 0; //循环标识
    let asyncControl = function () {
        if (loopNum < myData.length) {
            f1(loopNum).then(function () {
                loopNum++;
                asyncControl();
            });
        } else {
            // console.log('数据全部处理完了');
            temp = uniqueArray(temp)
            // console.log('符合条件博客数量===='+temp.length)
            let presend = {
                fetchcount: temp.length
            }
            res.send(presend)
        }
    }
    asyncControl()
})


//留言板 写留言
user.post('/writemessage', (req, res) => {

    


    let Comment_Content = req.body.Information.Comment_Content
    // let Comment_Id = req.body.Comment_Id
    let Comment_Id = randomId(16)
    let Comment_Level = Number(req.body.Information.Comment_Level)
    let Comment_Person_Acc = req.body.Information.Comment_Person_Acc
    let Comment_Person_Id = req.body.Information.Comment_Person_Id
    let Comment_Person_Name = req.body.Information.Comment_Person_Name
    let Comment_Person_Role = req.body.Information.Comment_Person_Role
    let Comment_Person_Avatar = req.body.Information.Comment_Person_Avatar


    let Father_Comment_Id = req.body.Information.Father_Comment_Id
    let Parent_Person_Acc = req.body.Information.Parent_Person_Acc
    let Parent_Person_Id = req.body.Information.Parent_Person_Id
    let Parent_Person_Name = req.body.Information.Parent_Person_Name
    let Parent_Person_Role = req.body.Information.Parent_Person_Role
    let Parent_Person_Avatar = req.body.Information.Parent_Person_Avatar
    let Root_Comment_Id = req.body.Information.Root_Comment_Id




    let mix = [Comment_Level,
        Root_Comment_Id,
        Father_Comment_Id,
        Comment_Id,
        Comment_Person_Role,
        Comment_Person_Acc,
        Comment_Person_Name,
        Comment_Person_Id,
        Comment_Person_Avatar,
        Parent_Person_Role,
        Parent_Person_Acc,
        Parent_Person_Name,
        Parent_Person_Id,
        Parent_Person_Avatar,
        Comment_Content]

    sql = 'insert into comments_message' +
        '(Comment_Level,Root_Comment_Id,Father_Comment_Id,Comment_Id,Comment_Person_Role,'+
        'Comment_Person_Acc,Comment_Person_Name,Comment_Person_Id,Comment_Person_Avatar,Parent_Person_Role,'+
        'Parent_Person_Acc,Parent_Person_Name,Parent_Person_Id,Parent_Person_Avatar,Comment_Content)' +
        'values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'

    chainFecth(sql,mix)
    .then(data=>{
        res.send({
            msg:'留言板留言成功！',
            code:1010,
            resmsg:data
        })
    })
    .catch(err=>{
        res.send({
            msg:'留言板留言失败！',
            code:1011,
            resmsg:err
        })
    })
})
//博客 写评论和回复
user.post('/writecommentandreply', (req, res) => {
    
    let Blog_Id = Number(req.body.Information.Blog_Id)
    let Blog_Title = req.body.Information.Blog_Title
    let Comment_Level = Number(req.body.Information.Comment_Level)
    let Comment_Id = randomId(16)
    let Root_Comment_Id = req.body.Information.Root_Comment_Id
    let Father_Comment_Id = req.body.Information.Father_Comment_Id
    let Comment_Person_Role = req.body.Information.Comment_Person_Role
    let Comment_Person_Acc = req.body.Information.Comment_Person_Acc
    let Comment_Person_Name = req.body.Information.Comment_Person_Name
    let Comment_Person_Id = req.body.Information.Comment_Person_Id
    let Comment_Person_Avatar = req.body.Information.Comment_Person_Avatar
    let Parent_Person_Role = req.body.Information.Parent_Person_Role
    let Parent_Person_Acc = req.body.Information.Parent_Person_Acc
    let Parent_Person_Name = req.body.Information.Parent_Person_Name
    let Parent_Person_Id = req.body.Information.Parent_Person_Id
    let Parent_Person_Avatar = req.body.Information.Parent_Person_Avatar
    let Comment_Content = req.body.Information.Comment_Content

    let mix = [
        Blog_Id,
        Blog_Title,
        Comment_Level,
        Comment_Id,
        Root_Comment_Id,
        Father_Comment_Id,
        Comment_Person_Role,
        Comment_Person_Acc,
        Comment_Person_Name,
        Comment_Person_Id,
        Comment_Person_Avatar,
        Parent_Person_Role,
        Parent_Person_Acc,
        Parent_Person_Name,
        Parent_Person_Id,
        Parent_Person_Avatar,
        Comment_Content
    ]
    let sql = 'insert into comments_blogs ' +
    '(Blog_Id,Blog_Title,Comment_Level,Comment_Id,Root_Comment_Id,Father_Comment_Id,'+
    'Comment_Person_Role,Comment_Person_Acc,Comment_Person_Name,Comment_Person_Id,'+
    'Comment_Person_Avatar,Parent_Person_Role,Parent_Person_Acc,Parent_Person_Name,'+
    'Parent_Person_Id,Parent_Person_Avatar,Comment_Content)' +
    'values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    chainFecth(sql,mix)
    .then(data=>{
        res.send({
            msg:'成功！',
            code:1012,
            resmsg:data
        })
    })
    .catch(err=>{
        console.log(err)

        res.send({
            msg:'失败！',
            code:1013,
            resmsg:err
        })
    })



})
//获取message页面
user.get('/getmessagepage', (req, res) => {
    sql = 'select *from message where Message_Status = 1'
    chainFecth(sql).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})
//message 页面留言
user.post('/messagecomments', (req, res) => {
    let st = Number(req.body.Start)
    let len = Number(req.body.Length)
    sql = '(select *from comments_message where Comment_Status=1 and Comment_Examined!=2 and Comment_Level=1 order by Id desc )limit ?,?'
    chainFecth(sql,[st,len])
    .then(data=>{
        //在根据commentid 循环查询所对应的二级回复
        let first = data
        let actions = []
        let innersql = 'select * from comments_message where Root_Comment_Id = ? and Comment_Examined !=2'
        first.forEach((v,index)=>{
            if(v.Comment_Status==0){
                v.Comment_Content = '该评论已被删除'
            }
            else if(v.Comment_Status==2){
                v.Comment_Content = '该评论已被冻结'
            }
            var action = ()=>{
                return new Promise((resolve,reject)=>{
                    chainFecth(innersql,v.Comment_Id).then(dt=>{
                        //为 一级回复新建 reply 属性保存 二级回复
                        v.reply = Object.assign(dt)
                        resolve()
                    }).catch(err=>{
                        reject(err)
                    })
                })
            }
            actions.push(action())
        })

        Promise.all(actions).then(resp=>{
            // console.log('done!')
            res.send(first)
        }).catch(error=>{
            console.log(error)
        })
    })
    .catch(err=>{
        console.log(err)
    })

})

//message 页面留言count
user.get('/messagecommentscount', (req, res) => {
    let sql = 'select count(*) as count from comments_message where Comment_Status=1 and Comment_Examined!=2 and Comment_Level=1'
    //用于获取所有一级 二级评论条数
    let sql2 = 'select count(*) as count from comments_message where Comment_Status=1 and Comment_Examined!=2'
    chainFecth(sql).then(data=>{
        chainFecth(sql2).then(dt=>{
            res.send({
                total:data[0].count,
                all:dt[0].count
            })
        }).catch(error=>{console.log(error)})
    }).catch(err=>{console.log(err)})
})
//message页面 写留言和回复
user.post('/writemessageandreply', (req, res) => {

    let Comment_Level = Number(req.body.message.Comment_Level)
    let Comment_Id = randomId(16)
    let Root_Comment_Id = req.body.message.Root_Comment_Id
    let Father_Comment_Id = req.body.message.Father_Comment_Id
    let Comment_Person_Role = req.body.message.Comment_Person_Role
    let Comment_Person_Acc = req.body.message.Comment_Person_Acc
    let Comment_Person_Name = req.body.message.Comment_Person_Name
    let Comment_Person_Id = req.body.message.Comment_Person_Id
    let Comment_Person_Avatar = req.body.message.Comment_Person_Avatar
    let Parent_Person_Role = req.body.message.Parent_Person_Role
    let Parent_Person_Acc = req.body.message.Parent_Person_Acc
    let Parent_Person_Name = req.body.message.Parent_Person_Name
    let Parent_Person_Id = req.body.message.Parent_Person_Id
    let Parent_Person_Avatar = req.body.message.Parent_Person_Avatar
    let Comment_Content = req.body.message.Comment_Content

    let mix = [
        Comment_Level,
        Comment_Id,
        Root_Comment_Id,
        Father_Comment_Id,
        Comment_Person_Role,
        Comment_Person_Acc,
        Comment_Person_Name,
        Comment_Person_Id,
        Comment_Person_Avatar,
        Parent_Person_Role,
        Parent_Person_Acc,
        Parent_Person_Name,
        Parent_Person_Id,
        Parent_Person_Avatar,
        Comment_Content
    ]
    let sql = 'insert into comments_message ' +
    '(Comment_Level,Comment_Id,Root_Comment_Id,Father_Comment_Id,'+
    'Comment_Person_Role,Comment_Person_Acc,Comment_Person_Name,Comment_Person_Id,'+
    'Comment_Person_Avatar,Parent_Person_Role,Parent_Person_Acc,Parent_Person_Name,'+
    'Parent_Person_Id,Parent_Person_Avatar,Comment_Content)' +
    'values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    chainFecth(sql,mix)
    .then(data=>{
        res.send({
            msg:'成功！',
            code:1014,
            resmsg:data
        })
    })
    .catch(err=>{
        console.log(err)

        res.send({
            msg:'失败！',
            code:1015,
            resmsg:err
        })
    })



})




//获取 about页面
user.get('/getaboutpage', (req, res) => {
    sql = 'select *from about where About_Status = 1'
    chainFecth(sql).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})


//获取博客收藏列表
user.post('/getcollectlist', (req, res) => {
    let uniqueid = req.body.User_UniqueId
    sql = 'select User_Collection from user_table where User_UniqueId=?'
    chainFecth(sql,uniqueid).then(data=>{
        res.send(data)
    }).catch(err=>{
        console.log(err)
    })
})
//获取博客收藏列表(用户)
//需要添加博客title id等详情
user.post('/getcollectlistuser', (req, res) => {
    let uniqueid = req.body.User_UniqueId
    let start = req.body.Start
    let length = req.body.Length
    sql = 'select User_Collection from user_table where User_UniqueId=?'
    chainFecth(sql,uniqueid).then(data=>{
        // console.log(data)
        if(data[0].User_Collection.length==0){
            res.send([])
        }
        else{
            let inner = 'select Blog_Title,Blog_Summary from blogs where Blog_Id=? and Blog_Status=1'
            let list = data[0].User_Collection.split(',')
            list = list.filter(v=>{
                return v!=''
            })
            let presend = []
            let actions=[]
            let count = 0
            list.map((v,index)=>{
                if(index>=start&&count<length){
                    var action = ()=>{
                        return new Promise((resolve,reject)=>{
                            chainFecth(inner,v).then(dt=>{
                                // console.log(dt)
                                let obj ={
                                    Blog_Id:v,
                                    Blog_Title:dt[0].Blog_Title,
                                    Blog_Summary:dt[0].Blog_Summary
                                }
                                presend.push(obj)
                                resolve()
                            }).catch(err=>{
                                reject(err)
                            })
                        })
                    }
                    count++
                    actions.push(action())
                }
                
            })

            Promise.all(actions).then(resp=>{

                res.send(presend)
            }).catch(error=>{console.log(error)})


        }
        
        // res.send(data)
    }).catch(err=>{
        console.log(err)
    })
})


//博客收藏
user.post('/collect', (req, res) => {
    let id = req.body.Blog_Id
    let uniqueid = req.body.User_UniqueId
    sql = 'update user_table set User_Collection = CONCAT(User_Collection,?) where User_UniqueId=?'
    chainFecth(sql,[','+id,uniqueid]).then(data=>{
        //将blog的收藏数+1
        let innersql = 'update blogs set Blog_Collected = Blog_Collected+1 where Blog_Id=?'
        chainFecth(innersql,Number(id)).then(dt=>{
            res.send(dt)
        }).catch(err=>{console.log(err)})
    }).catch(err=>{
        console.log(err)
    })
})
//博客取消收藏
user.post('/uncollect', (req, res) => {
    let blogid = Number(req.body.Blog_Id)
    let collectionlist = req.body.Collection_List 
    let uniqueid = req.body.User_UniqueId
    sql = 'update user_table set User_Collection = ? where User_UniqueId=?'
    chainFecth(sql,[collectionlist,uniqueid]).then(data=>{
        //将blog的收藏数-1
        let innersql = 'update blogs set Blog_Collected = Blog_Collected-1 where Blog_Id=?'
        chainFecth(innersql,blogid).then(dt=>{
            res.send(dt)
        }).catch(err=>{console.log(err)})
        
    }).catch(err=>{
        console.log(err)
    })
})

//博客取消收藏(用户)
user.post('/uncollectuser', (req, res) => {
    let blogid = Number(req.body.Blog_Id)
    // let collectionlist = req.body.Collection_List 
    let uniqueid = req.body.User_UniqueId
    sql = 'select User_Collection from user_table where User_UniqueId=?'
    chainFecth(sql,uniqueid).then(data=>{
        let collection = data[0].User_Collection
        let collection_list = collection.split(',')
        collection_list = collection_list.filter(v=>{
            return v!=blogid
        })
        let updatesql = 'update user_table set User_Collection =? where User_UniqueId=?'

        let innersql = 'update blogs set Blog_Collected = Blog_Collected-1 where Blog_Id=?'
        chainFecth(updatesql,[collection_list.toString(),uniqueid]).then(data=>{
            //将blog的收藏数-1
            chainFecth(innersql,blogid).then(dt=>{res.send(dt)}).catch(err=>{console.log(err)})
        }).catch(err=>{console.log(err)})
       
    }).catch(err=>{
        console.log(err)
    })
})

//Blog 点赞+1
user.post('/like', (req, res) => {
    let id = req.body.Blog_Id
    let sql = 'update blogs set Blog_Likes = Blog_Likes+1 where Blog_id = ?'
    chainFecth(sql,id).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})
//Blog 浏览+1
user.post('/view', (req, res) => {
    let id = req.body.Blog_Id
    let sql = 'update blogs set Blog_Views = Blog_Views+1 where Blog_Id = ?'
    chainFecth(sql,id).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})
//Blog 评论+1
user.post('/addcommentcount', (req, res) => {
    let id = req.body.Blog_Id
    let sql = 'update blogs set Blog_Comments = Blog_Comments+1 where Blog_id = ?'
    chainFecth(sql,id).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})

//获取所有头像
user.get('/getavatars', (req, res) => {
    let sql = 'select Avatars from website where Id=1'
    chainFecth(sql).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})
//获取用户信息
user.post('/getuserinfo', (req, res) => {
    let Account = req.body.Account
    let UniqueId = req.body.UniqueId
    let sql = 'select * from user_table where User_Account=? and User_UniqueId=?'
    chainFecth(sql,[Account,UniqueId]).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})
//用户更新头像
user.post('/updateavatar', (req, res) => {
    let avatarurl = req.body.UserAvatar
    let uniqueid = req.body.UserUniqueId

    let sql = 'update user_table set User_Avatar = ? where User_UniqueId=?'

    let innersql1 = 'update comments_blogs set Comment_Person_Avatar=? where Comment_Person_Id=?'
    let innersql2 = 'update comments_blogs set Parent_Person_Avatar=? where Parent_Person_Id=?'
    let innersql3 = 'update comments_message set Comment_Person_Avatar=? where Comment_Person_Id=?'
    let innersql4 = 'update comments_message set Parent_Person_Avatar=? where Parent_Person_Id=?'
    let innersql5 = 'update blogs set Blog_Author_Avatar=? where Blog_Author_UniqueId=?'
    let innersql6 = 'update message set Message_Author_Avatar=? where Message_Author_UniqueId=?'
    let sqlarry = [innersql1,innersql2,innersql3,innersql4,innersql5,innersql6]
    chainFecth(sql,[avatarurl,uniqueid]).then(data=>{
        // res.send(data)
        let actions=[]
        sqlarry.map((v,index)=>{
            let action = ()=>{
                return new Promise((resolve,reject)=>{
                    chainFecth(v,[avatarurl,uniqueid]).then(res=>{resolve()}).catch(err=>{reject(err)})
                })
            }
            actions.push(action())
        })
        Promise.all(actions).then(resp=>{
            res.send({
                msg:'头像更新成功',
                callback:resp
            })
        }).catch(error=>{console.log(error)})
    }).catch(err=>{console.log(err)})
})
//用户更新昵称 
user.post('/updatenickname', (req, res) => {
    let nickname = req.body.UserNickName
    let uniqueid = req.body.UserUniqueId

    let sql = 'update user_table set User_Nickname = ? where User_UniqueId=?'

    let innersql1 = 'update comments_blogs set Comment_Person_Name=? where Comment_Person_Id=?'
    let innersql2 = 'update comments_blogs set Parent_Person_Name=? where Parent_Person_Id=?'
    let innersql3 = 'update comments_message set Comment_Person_Name=? where Comment_Person_Id=?'
    let innersql4 = 'update comments_message set Parent_Person_Name=? where Parent_Person_Id=?'
    let innersql5 = 'update blogs set Blog_Author=? where Blog_Author_UniqueId=?'
    let innersql6 = 'update message set Message_Author=? where Message_Author_UniqueId=?'
    let sqlarry = [innersql1,innersql2,innersql3,innersql4,innersql5,innersql6]
    chainFecth(sql,[nickname,uniqueid]).then(data=>{
        // res.send(data)
        let actions=[]
        sqlarry.map((v,index)=>{
            let action = ()=>{
                return new Promise((resolve,reject)=>{
                    chainFecth(v,[nickname,uniqueid]).then(res=>{resolve()}).catch(err=>{reject(err)})
                })
            }
            actions.push(action())
        })
        Promise.all(actions).then(resp=>{
            res.send({
                msg:'昵称更新成功',
                callback:resp
            })
        }).catch(error=>{console.log(error)})
    }).catch(err=>{console.log(err)})
})
//用户更新密码 
user.post('/updatepassword', (req, res) => {
    //原密码
    let password = req.body.Password
    //新密码
    let newpassword = req.body.NewPassword
    let uniqueid = req.body.UserUniqueId

    let sql = 'update user_table set User_Password = ? where User_Password=? and User_UniqueId =?'
    chainFecth(sql,[newpassword,password,uniqueid]).then(data=>{
        res.send({
            msg:'更新密码成功',
            callback:data
        })
    }).catch(err=>{console.log(err)})
})
//用户更新性别
user.post('/updategender', (req, res) => {
    let gender = Number(req.body.Gender)
    let uniqueid = req.body.UserUniqueId
    let sql = 'update user_table set User_Gender = ? where User_UniqueId =?'
    chainFecth(sql,[gender,uniqueid]).then(data=>{
        res.send({
            msg:'更新性别成功',
            callback:data
        })
    }).catch(err=>{console.log(err)})
})
//用户更新邮箱
user.post('/updateemail', (req, res) => {
    let email = req.body.Email
    let uniqueid = req.body.UserUniqueId
    let sql = 'update user_table set User_Email = ? where User_UniqueId =?'
    chainFecth(sql,[email,uniqueid]).then(data=>{
        res.send({
            msg:'更新邮箱成功',
            callback:data
        })
    }).catch(err=>{console.log(err)})
})
//用户更新手机 
user.post('/updatephonenumber', (req, res) => {
    let phonenumber = req.body.PhoneNumber
    let uniqueid = req.body.UserUniqueId
    let sql = 'update user_table set User_PhoneNumber = ? where User_UniqueId =?'
    chainFecth(sql,[phonenumber,uniqueid]).then(data=>{
        res.send({
            msg:'更新手机号成功',
            callback:data
        })
    }).catch(err=>{console.log(err)})
})
//用户更新简介
user.post('/updateintroduction', (req, res) => {
    let introduction = req.body.Introduction
    let uniqueid = req.body.UserUniqueId
    let sql = 'update user_table set User_Introduction = ? where User_UniqueId =?'
    chainFecth(sql,[introduction,uniqueid]).then(data=>{
        res.send({
            msg:'更新简介成功',
            callback:data
        })
    }).catch(err=>{console.log(err)})
})


  //Notification
//用户获取未读信息
user.post('/getnotificationuser', (req, res) => {
    let uniqueid = req.body.UserUniqueId
    // let sql1 = 'select * from comments_blogs where Parent_Person_Id=? and IsRead=0 and IsClear=0 order by Id desc'
    // let sql2 ='select * from comments_message where Parent_Person_Id=? and IsRead=0 and IsClear=0 order by Id desc'
    let sql1 = 'select * from comments_blogs where Parent_Person_Id=? and IsClear=0 order by Id desc'
    let sql2 ='select * from comments_message where Parent_Person_Id=? and IsClear=0 order by Id desc'
    let mixsql = [sql1,sql2]
    let actions = []
    let result=[]
    mixsql.forEach(v=>{
        let action = ()=>{
            return new Promise((resolve,reject)=>{
                chainFecth(v,uniqueid).then(data=>{
                    result = result.concat(data)
                    resolve()
                }).catch(err=>{reject(err)})
            })
        }
        actions.push(action())
    })
    Promise.all(actions).then(resp=>{
        res.send({
            message:'获取消息成功',
            data:result,
            callback:resp
        })
    }).catch(error=>{console.log(error)})

})
//用户 将信息设为已读状态
user.post('/setnotireadeduser', (req, res) => {
    let condition = req.body.Condition
    let commentid = req.body.Comment_Id
    let sql = ''
    if(condition=='blog'){
        sql = 'update comments_blogs set IsRead=1 where Comment_Id=?'
    }else if(condition =='message'){
        sql = 'update comments_message set IsRead=1 where Comment_Id=?'
    }
    chainFecth(sql,commentid).then(data=>{
        res.send({
            msg:'已读成功',
            callback:data
        })
    }).catch(err=>{console.log(err)})

})

//用户 将信息设为清除状态
user.post('/setnoticleareduser', (req, res) => {
    let condition = req.body.Condition
    let commentid = req.body.Comment_Id
    let sql = ''
    if(condition=='blog'){
        sql = 'update comments_blogs set IsClear=1 where Comment_Id=?'
    }else if(condition =='message'){
        sql = 'update comments_message set IsClear=1 where Comment_Id=?'
    }
    chainFecth(sql,commentid).then(data=>{
        res.send({
            msg:'清除成功',
            callback:data
        })
    }).catch(err=>{console.log(err)})

})
//用户 所有信息 设为已读
user.post('/setallnotireadeduser', (req, res) => {
    let blog_id_list = req.body.Blog_Id_List
    let message_id_list = req.body.Message_Id_List

    let sql1 = 'update comments_blogs set IsRead=1 where Comment_Id=?'
    let sql2 = 'update comments_message set IsRead=1 where Comment_Id=?'
    let actions = []
    if(blog_id_list){
        blog_id_list.forEach(v=>{
            return new Promise((resolve,reject)=>{
                let action1 = ()=>{
                    chainFecth(sql1,v).then(data=>{
                        resolve(data)
                    }).catch(err=>{reject(err)})
                }
                actions.push(action1())
            })
        })
    }
    if(message_id_list){
        message_id_list.forEach(v=>{
            return new Promise((resolve,reject)=>{
                let action2 = ()=>{
                    chainFecth(sql2,v).then(data=>{
                        resolve(data)
                    }).catch(err=>{reject(err)})
                }
                actions.push(action2())
            })
        })
    }
    Promise.all(actions).then(resp=>{
        res.send({
            msg:'所有消息设为已读成功',
            callback:resp
        })
    }).catch(err=>{console.log(err)})

})

//用户 所有信息 设为清除
user.post('/setallnoticleareduser', (req, res) => {
    let blog_id_list = req.body.Blog_Id_List
    let message_id_list = req.body.Message_Id_List

    let sql1 = 'update comments_blogs set IsClear=1 where Comment_Id=?'
    let sql2 = 'update comments_message set IsClear=1 where Comment_Id=?'
    let actions = []
    if(blog_id_list){
        blog_id_list.forEach(v=>{
            return new Promise((resolve,reject)=>{
                let action1 = ()=>{
                    chainFecth(sql1,v).then(data=>{
                        resolve(data)
                    }).catch(err=>{reject(err)})
                }
                actions.push(action1())
            })
        })
    }
    if(message_id_list){
        message_id_list.forEach(v=>{
            return new Promise((resolve,reject)=>{
                let action2 = ()=>{
                    chainFecth(sql2,v).then(data=>{
                        resolve(data)
                    }).catch(err=>{reject(err)})
                }
                actions.push(action2())
            })
        })
    }
    Promise.all(actions).then(resp=>{
        res.send({
            msg:'所有消息设为清除成功',
            callback:resp
        })
    }).catch(err=>{console.log(err)})

})
//获取用户未读信息count
user.post('/getunreadnoticount',(req,res)=>{
    let uniqueid = req.body.UniqueId
    let sql1 = 'select COUNT(*) as count from comments_blogs where Parent_Person_Id=? and IsRead=0 and IsClear=0'
    let sql2 = 'select COUNT(*) as count from comments_message where Parent_Person_Id=? and IsRead=0 and IsClear=0'
    let count = 0
    chainFecth(sql1,uniqueid).then(data=>{
        count+=data[0].count
        chainFecth(sql2,uniqueid).then(dt=>{
            count+=dt[0].count
            res.send({
                UnReadCount:count
            })
        }).catch(error=>{console.log(error)})
    }).catch(err=>{console.log(err)})
})



//归档
//获取博客 id，title，createtime
user.get('/getarrangedblogs',(req,res)=>{
    let sql = '(SELECT Blog_Id,Blog_Title,Blog_Createtime FROM `blogs` WHERE Blog_Status=1 ) ORDER BY Blog_Id DESC'
    chainFecth(sql).then(data=>{
        res.send(data)
    }).catch(err=>{console.log(err)})
})

//获取广告页面
user.get('/getadvertisement', (req, res) => {
    let sql = 'select Adv_Tittle,Adv_Introduction,Adv_Img_Link_Url from advertisement'
    chainFecth(sql).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})

//获取博客背景图片
user.get('/getbackgroundimg', (req, res) => {
    sql = 'select Backgroung_Img from website where Id=1'
    chainFecth(sql).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})


/**
 * friend link
 * author hujie
 * date 2022.05.12
 */

//获取全部友链 untest
user.get('/getallfriendlink',(req,res)=>{
    let sql = '(select * from friendlink where LinkStatus=1) order by id asc'
    chainFecth(sql)
    .then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})

module.exports = user