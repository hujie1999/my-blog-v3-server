const express = require('express')
const admin = express.Router()
// const url = require('url')


let { db } = require('../data/database')
let formidable = require("formidable");
let fs = require('fs')
let { randomId } = require('../utils/randomid')
let { check } = require('./token/check');
let { createToken } = require('./token/create')
let { varifyToken } = require('./token/verify')
let { preset } = require('./token/admintokensettings')
admin.use((req,res,next)=>{
    check(req,res,next)
})

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
admin.post('/adminlogin',(req,res)=>{
    let account = req.body.account
    let password = req.body.password

    const sql = 'select *from admin_table where Admin_Account = ? and Admin_Password = ?'
    chainFecth(sql,[account,password]).then(data=>{
        let resinfo = {}
        if(data.length == 1){
            const Admin_Status = data[0].Admin_Status
            const Admin_UniqueId = data[0].Admin_UniqueId
            //被删除 注销
            if(Admin_Status==0){
                resinfo.message = '账号被删除',
                resinfo.code = 1002
                res.send(resinfo)
            }
            //被冻结
            else if(Admin_Status==2){
                resinfo.message = '账号被冻结',
                resinfo.code = 1003
                res.send(resinfo)
            }
            //正常
            else if(Admin_Status==1){
                let params = {
                    uniqueid: Admin_UniqueId,
                    create_time : Math.floor(Date.now()/1000),
                    refresh_time : preset.refresh_time,
                    access_time :Math.floor(Date.now()/1000+(preset.access_time)),
                    forbidden_time : preset.forbidden_time
                }
                let token = createToken(params)
                resinfo.message = '登陆成功'
                resinfo.code = 1000
                resinfo.role = data[0]['Admin_Role']
                resinfo.nickname = data[0]['Admin_Nickname'],
                resinfo.account = data[0]['Admin_Account'],
                resinfo.uniqueid = data[0]['Admin_UniqueId'],
                resinfo.token = token
                res.send(resinfo)
            }
            
        }
        else if(data.length == 0){
            resinfo.message = '账号密码不匹配',
            resinfo.code = 1004
            res.send(resinfo)
        }
    }).catch(err=>{
        console.log(err)
        res.send({
            message:'登录失败',
            code:1001
        })
    })

})
//刷新 token
admin.post('/refeshtoken', (req, res) => {
    // console.log('刷新token接口调用')
    const old_token = req.headers.authorization
    let decoded = {}
    try {
        decoded = varifyToken(old_token).data
    } catch (error) {
        res.send({
            msg:'旧token解析失败',
            code:20002,
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
        code:20005
    })
    
})

//以下是图片上传的异步函数
const judgeOversize = function(set,aimed){
    return new Promise((resolve,reject)=>{
        if(set>aimed){
            resolve()
        }else{
            reject()
        }
    })
}
const fileExistOrCreate  = function(createdfilename){
    return new Promise((resolve,reject)=>{
        if (fs.existsSync(createdfilename)) {
            resolve()
        }
        else {
            fs.mkdir(createdfilename,(err) =>{
                resolve(err)
            })
        }
    })
}
const readTempFile = function(aimedfilename){
    return new Promise((resolve,reject)=>{
        fs.readFile(aimedfilename, (err, data) => {
            if(data){
                resolve(data)
            }
            else{
                reject(err)
            }
        })
            
    })
}
const saveImage = function(filedata,createdfilename,files){
    return new Promise((resolve,reject)=>{
        let filename = createdfilename + '/' + randomId(10) + '-' + files.image.name
        let finallname = filename.split('/public').join('')
            fs.writeFile(filename, filedata, 'binary', (err) =>{
                reject(err)
                return
            })
            // resolve(filename)
            resolve(finallname)
            
    })
}
const deleteTempLink = function(files){
    return new Promise((resolve,reject)=>{
        fs.unlink(files.image.path,(err) => { 
            reject(err)
            return
         })
         resolve()
    })
}
const execUpdateImage = async function(maxsize,files,createdfilename,res){
    await judgeOversize(maxsize,files.image.size)
    await fileExistOrCreate(createdfilename)
    const data =  await readTempFile(files.image.path)
    const name = await saveImage(data,createdfilename,files)
    await deleteTempLink(files)
    res.send({
              message:'图片上传成功!',
              code:14,
            //不加 userimgbaseurl，图片在前端展示的时候加
            imgpath:name.toString().substr(1)
            })
}

//上传图片
admin.post('/uploadimg', (req, res) => {
    var form = new formidable.IncomingForm();               
    let maxsize = 5 * 1024 * 1024    //5M
    try{
        form.parse(req, function (err, fields, files) {
            // const Blog_Id = fields.Blog_Id
            // const createdfilename = './public/blogimgs/'+Blog_Id
            const createdfilename = './public/blogimgs'
            execUpdateImage(maxsize,files,createdfilename,res)
        })
    }catch(err){
        res.send({
            message:'出错了:'+err,
            code:15
        })
        return
    }

})
//上传图片后
//根据标识更新数据库图片路径
admin.post('/updateimgpath', (req, res) => {
    let identification = req.body.identification
    let Blog_Id = Number(req.body.Blog_Id)
    let image_path = String(req.body.image_path)+','
    // console.log('identification=>'+identification)
    // console.log('Blog_Id=>'+Blog_Id)
    // console.log('image_path=>'+image_path)

    let sql = ''
    if(identification == 'summary'){
        sql = 'update blogs set Blog_SummaryImg=? where Blog_Id=?'
    }
    else if(identification == 'content'){
        // image_path = image_path+','
        sql = 'update blogs set Blog_Imgs=CONCAT(Blog_Imgs,?) where Blog_Id=?'
    }
    chainFecth(sql,[image_path,Blog_Id])
    .then(data=>{
        res.send({
            message:'图片路径插入成功！',
            code:16
        })
    })
    .catch(err=>{
        res.send({
            message:'图片路径插入失败！',
            code:17
        })
    })

})

//根据imgpgth identification  instance和blog id 
//更新数据库图片地址 
//并删除服务器图片
admin.post('/deleteimg', (req, res) => {   
    let Identification = String(req.body.Identification)
    let Instance = String(req.body.Instance).split(',')
    let Blog_Id = Number(req.body.Blog_Id)
    let ImgPath = String(req.body.ImgPath)
    let sql =''
    // console.log('Identification==>'+Identification)
    // console.log(Instance)
    // console.log('Blog_Id==>'+Blog_Id)
    // console.log('ImgPath==>'+ImgPath)

    //过滤Instance数组
    Instance = Instance.filter(v=>{
        return v != ImgPath
    })
    if(Identification == 'summary'){
        //summary删除为清空
        Instance = null
        sql = 'update blogs set Blog_SummaryImg = ? where Blog_Id=?'
    }
    else if(Identification == 'content'){
        //content删除为替换
        if(Instance.length==0){
            Instance = null
        }else{
            Instance = Instance.toString()+','
        }
        sql = 'update blogs set Blog_Imgs=? where Blog_Id=?'
    }
    
    chainFecth(sql,[Instance,Blog_Id]).then(data=>{
        //再删除服务器对应图片
        // console.log('再删除服务器对应图片${ImgPath}')
        if(data){
            if (fs.existsSync('.'+ImgPath)) {
                fs.unlink(ImgPath.substr(1), function(err){
                    if(err){
                        throw err
                    }
                    else{
                        res.send({
                            message:'文件:'+ImgPath+'删除成功！',
                            code:18
                        })
                        return
                    }
                   })
            }else{
                
                console.log('文件不存在')
                res.send({
                    message:'文件:'+ImgPath+'不存在',
                    code:19
                })
            }
        }
    }).catch(err=>{
        res.send({
            message:'文件:'+ImgPath+'更新到数据库失败!',
            err:err,
            code:20
        })
        console.log(err)
        // return

    })

})

    //博客发布页面
//添加一条草稿状态的空博客
admin.post('/addonedraft',(req,res)=>{
    let sql = 'insert into blogs set Blog_Status=3'
    chainFecth(sql).then(data=>{
        res.send({
            message:'草稿状态的空博客添加成功！',
            code:23
        })
    }).catch(err=>{
        // console.log(err)
        res.send({
            message:'草稿状态的空博客添加失败'+err,
            code:23
        })
    })
})

//隶属于 '/savedraftwithcondition'
let doFetch = function(sql,params,res){
    chainFecth(sql,params).then(data=>{
        res.send({
            message:'博客存入草稿箱成功！',
            code:27
        })
    }).catch(err=>{
        res.send({
            message:'博客存入草稿箱失败失败！'+err,
            code:28
        })
    })
}

//按condition 条件保存草稿 
admin.post("/savedraftwithcondition", (req, res) => {

    let Indentity = String(req.body.Indentity)
    let Aimed_Blog_Id = Number(req.body.Aimed_Blog_Id)

    let Blog_Title = String(req.body.Blog_Title)
    let Blog_Summary = String(req.body.Blog_Summary)
    let Blog_Content = String(req.body.Blog_Content)
    let Blog_Tags = String(req.body.Blog_Tags)
    let Blog_Class = String(req.body.Blog_Class)
    let Blog_Author = String(req.body.Blog_Author)
    // let sql = ''
    // let params = []
    let sql = 'update blogs set Blog_Title=?,Blog_Summary=?,Blog_Content=?,Blog_Tags=?,Blog_Class=?,Blog_Author=? where Blog_Id =?'
    let params=[Blog_Title,Blog_Summary,Blog_Content,Blog_Tags,Blog_Class,Blog_Author,Aimed_Blog_Id]
    if(Indentity == 'true'){
        //上传过图片
         
        doFetch(sql,params,res)
         
    }
    else if(Indentity == 'false'){
        //没上传图片,先创建一个空白草稿态博客
        let innersql = 'insert into blogs set Blog_Status=3'
        chainFecth(innersql).then(data=>{
            doFetch(sql,params,res)
        }).catch(err=>{
            console.log(err)
        })
    }
    
})
//发布保存的草稿
//传Blog_Id，让Status = 1 
admin.post("/publishdrafts", (req, res) => {
    let Blog_Id = Number(req.body.Blog_Id)
    let sql = 'update blogs set Blog_Status =1 where Blog_Id=?'
    chainFecth(sql,Blog_Id)
    .then(data=>{
        res.send({
            message:'发布草稿为博客成功！',
            code:29
        })
    })
    .catch(err=>{
        res.send({
            message:'发布草稿为博客失败！',
            code:30,
            resaon:err
        })
    })

})
//按condition 条件发布博客 
admin.post("/publishwithcondition", (req, res) => {
    let Indentity = String(req.body.Indentity)
    let Aimed_Blog_Id = Number(req.body.Aimed_Blog_Id)

    let Blog_Title = String(req.body.Blog_Title)
    let Blog_Summary = String(req.body.Blog_Summary)
    let Blog_Content = String(req.body.Blog_Content)
    let Blog_Tags = String(req.body.Blog_Tags)
    let Blog_Class = String(req.body.Blog_Class)
    let Blog_Author = String(req.body.Blog_Author)
    let sql = ''
    let params = []
    if(Indentity == 'true'){
        //上传过图片,将status设为1并更新其他数据
         sql = 'update blogs set Blog_Title=?,Blog_Summary=?,Blog_Content=?,Blog_Tags=?,Blog_Class=?,Blog_Author=?,Blog_Status=1 '
         +' where Blog_Id =?'
         params=[Blog_Title,Blog_Summary,Blog_Content,Blog_Tags,Blog_Class,Blog_Author,Aimed_Blog_Id]
    }
    else if(Indentity == 'false'){
        //没上传图片
        params=[Blog_Title,Blog_Summary,Blog_Content,Blog_Tags,Blog_Class,Blog_Author]
        sql = 'insert into blogs (Blog_Title,Blog_Summary,Blog_Content,Blog_Tags,Blog_Class,Blog_Author) values (?,?,?,?,?,?)'
    }
    chainFecth(sql,params).then(data=>{
        res.send({
            message:'博客发布成功！',
            code:25
        })
    }).catch(err=>{
        res.send({
            message:'博客发布失败！'+err,
            code:26
        })
    })
})
//冻结博客
//传Blog_Id，让Status = 2
admin.post("/frozenblog", (req, res) => {
    let Blog_Id = Number(req.body.Blog_Id)
    let sql = 'update blogs set Blog_Status =2 where Blog_Id=?'
    chainFecth(sql,Blog_Id)
    .then(data=>{
        res.send({
            message:'博客冻结成功！',
            code:31
        })
    })
    .catch(err=>{
        res.send({
            message:'博客冻结失败！',
            code:32,
            resaon:err
        })
    })

})
//解冻博客
//传Blog_Id，让Status = 1
admin.post("/unfrozenblog", (req, res) => {
    let Blog_Id = Number(req.body.Blog_Id)
    let sql = 'update blogs set Blog_Status =1 where Blog_Id=?'
    chainFecth(sql,Blog_Id)
    .then(data=>{
        res.send({
            message:'博客解冻成功！',
            code:33
        })
    })
    .catch(err=>{
        res.send({
            message:'博客冻结失败！',
            code:34,
            resaon:err
        })
    })

})
//删除博客
//传Blog_Id，让Status = 0

admin.post("/deleteblog", (req, res) => {
    let Blog_Id = Number(req.body.Blog_Id)
    let sql = 'update blogs set Blog_Status =0 where Blog_Id=?'
    chainFecth(sql,Blog_Id)
    .then(data=>{
        res.send({
            message:'博客删除成功成功！',
            code:35
        })
    })
    .catch(err=>{
        res.send({
            message:'博客删除失败！',
            code:36,
            resaon:err
        })
    })

})

// 获取正常状态博客列表 Blog_Status=1
admin.post('/activeblogslist', (req, res) => {
    let st = Number(req.body.start)
    let len = Number(req.body.length)
    let sql = '(select * from blogs where Blog_Status=1  order by Blog_Id desc)  limit ?,?'
    db.query(sql, [st, len], (err, data) => {
        if (err) {
            console.log(err)
        } else {
            // console.log('列表查询成功---------->' + new Date().toLocaleTimeString())
            res.send(data)
        }
    })
})
admin.get('/activeblogscount',(req,res,)=>{
    const sql = 'select count(*) as count from blogs where Blog_Status = 1'
    db.query(sql, (err, data) => {
        if (err) {
            console.log(err)
        } else {           
            res.send(data)
        }
    })
})
// 获取冻结状态状态博客列表 Blog_Status=2
admin.post('/frozenblogslist', (req, res) => {
    let st = Number(req.body.start)
    let len = Number(req.body.length)
    let sql = '(select * from blogs where Blog_Status=2  order by Blog_Id desc)  limit ?,?'
    db.query(sql, [st, len], (err, data) => {
        if (err) {
            console.log(err)
        } else {
            // console.log('列表查询成功---------->' + new Date().toLocaleTimeString())
            res.send(data)
        }
    })
})
admin.get('/frozenblogscount',(req,res,)=>{
    const sql = 'select count(*) as count from blogs where Blog_Status = 2'
    db.query(sql, (err, data) => {
        if (err) {
            console.log(err)
        } else {           
            res.send(data)
        }
    })
})
// 获取草稿状态状态博客列表 Blog_Status=3
admin.post('/draftblogslist', (req, res) => {
    let st = Number(req.body.start)
    let len = Number(req.body.length)
    let sql = '(select * from blogs where Blog_Status=3  order by Blog_Id desc)  limit ?,?'
    db.query(sql, [st, len], (err, data) => {
        if (err) {
            console.log(err)
        } else {
            res.send(data)
        }
    })
})
admin.get('/draftblogscount',(req,res,)=>{
    const sql = 'select count(*) as count from blogs where Blog_Status = 3'
    db.query(sql, (err, data) => {
        if (err) {
            console.log(err)
        } else {           
            res.send(data)
        }
    })
})

//根据Blog_Id搜索博客
//2022.03.03补充：
//后台登陆人员都为管理员，可以不用设置Status，方便其他功能复用
//保留注释，持续观察
admin.post('/takeablog', (req, res) => {
    let id = Number(req.body.bgid)
    // let sql = 'select *from blogs where Blog_Id=? and Blog_Status=1'
    
    let sql = 'select *from blogs where Blog_Id=?'
    chainFecth(sql,id).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})
//所有标签
admin.get('/alltagslist', (req, res) => {
    let sql = 'select Tag_List from website where Id=1'
    chainFecth(sql).then(data=>{res.send(data[0].Tag_List.split(','))}).catch(err=>{console.log(err)})

})
//所有分类
admin.get('/allclasslist', (req, res) => {
    let sql = 'select Class_List from website where Id=1'
    chainFecth(sql).then(data=>{res.send(data[0].Class_List.split(','))}).catch(err=>{console.log(err)})

})
//最后一条博客Id
//前台  lastid +1  即是 所需要发布的博客id，因为博客id设置为自增
admin.get('/lastblogid', (req, res) => {
    let sql = '(select Blog_Id from blogs order by Blog_Id desc) limit 1'
    chainFecth(sql).then(data=>{res.send(data[0])}).catch(err=>{console.log(err)})

})
//修改博客
//修改完博客表，要将关联的 博客留言表更新
admin.post('/updateblog', (req, res) => {
    let Blog_Id = Number(req.body.Blog_Id)
    let Blog_Title = String(req.body.Blog_Title)
    let Blog_Summary = String(req.body.Blog_Summary)
    let Blog_Content = String(req.body.Blog_Content)
    let Blog_Tags = String(req.body.Blog_Tags)
    let Blog_Class = String(req.body.Blog_Class)


    let sql = 'update blogs set Blog_Title=?,Blog_Summary=?,Blog_Content=?,Blog_Tags=?,Blog_Class=? '
    +' where Blog_Id=?'
    let sortparams = [Blog_Title,Blog_Summary,Blog_Content,Blog_Tags,Blog_Class,Blog_Id]
    chainFecth(sql,sortparams).then(data=>{
        let innersql = 'update comments_blogs set Blog_Title=? where Blog_Id=?'
        chainFecth(innersql,[Blog_Title,Blog_Id])
        .then(data=>{
            res.send({
                message:'博客更新成功！',
                code:21
            })
        })
        .catch(err=>{
            console.log('博客评论关联字段更新失败')
            throw err
        })
        
    }).catch(err=>{
        console.log(err)
        res.send({
            message:'博客更新成功失败',
            code:22
        })
    })
})




//评论

//获取正常 过审 状态 博客评论列表
admin.post('/activeblogcommentslist', (req, res) => {
    let insres = res
    let st = Number(req.body.start)
    let len = Number(req.body.length)
    let sql = '(select * from comments_blogs where Comment_Status=1 and Comment_Examined=1  order by Id desc)  limit ?,?'
    db.query(sql, [st, len], (err, dt) => {
        if (err) {
            console.log(err)
            insres.end()
        } else {
            // res.send(data)
            if(dt.length!=0){
                let saver = dt
                let innersql = 'select Comment_Content  from comments_blogs where Comment_Id=?'
                let actions = []
                dt.forEach((i,index) => {
                    if(i['Father_Comment_Id']!=null){
                        var action = ()=>{
                            return new Promise((resolve,reject)=>{
                                db.query(innersql,i['Father_Comment_Id'],(err,data)=>{
                                    if(err){
                                        reject(err)
                                    }else{
                                        saver[index].Parrent_Comment_Content=data[0]
                                        resolve()                         
                                    }
                                })
                            })
                        }
                        actions.push(action())
                    }
                });
                Promise.all(actions).then(res=>{
                    insres.send(saver)
                }).catch(err=>{
                    console.log(err)
                    insres.end()
                })
            }
            else{
                insres.send(dt)
            }
        }
    })
})
//获取正常 过审 状态博客评论列表数量
admin.get('/activeblogcommentscount', (req, res) => {
    let sql = 'select count(*) as count from comments_blogs where Comment_Status=1 and Comment_Examined=1'
    chainFecth(sql)
    .then(data=>{
        res.send(data)
    })
    .catch(err=>{
        console.log(err)
        res.end()
    })
})

//获取冻结 过审状态博客评论列表
admin.post('/frozenblogcommentslist', (req, res) => {
    let st = Number(req.body.start)
    let len = Number(req.body.length)
    let sql = '(select * from comments_blogs where Comment_Status=2 and Comment_Examined=1  order by Id desc)  limit ?,?'
    db.query(sql, [st, len], (err, data) => {
        if (err) {
            console.log(err)
            res.end()
        } else {
            res.send(data)
        }
    })
})
//获取冻结 过审 状态博客评论列表数量
admin.get('/frozenblogcommentscount', (req, res) => {
    let sql = 'select count(*) as count from comments_blogs where Comment_Status=2 and Comment_Examined=1'
    chainFecth(sql)
    .then(data=>{
        res.send(data)
    })
    .catch(err=>{
        console.log(err)
        res.end()
    })
})

//获取正常 过审 状态 留言板评论列表
admin.post('/activemessagecommentslist', (req, res) => {
    // let st = Number(req.body.start)
    // let len = Number(req.body.length)
    // let sql = '(select * from comments_message where Comment_Status=1 and Comment_Examined=1  order by Id desc)  limit ?,?'
    // db.query(sql, [st, len], (err, data) => {
    //     if (err) {
    //         console.log(err)
    //         res.end()
    //     } else {
    //         res.send(data)
    //     }
    // })
    let insres = res
    let st = Number(req.body.start)
    let len = Number(req.body.length)
    let sql = '(select * from comments_message where Comment_Status=1 and Comment_Examined=1  order by Id desc)  limit ?,?'
    db.query(sql, [st, len], (err, dt) => {
        if (err) {
            console.log(err)
            insres.end()
        } else {
            // res.send(data)
            if(dt.length!=0){
                let saver = dt
                let innersql = 'select Comment_Content  from comments_message where Comment_Id=?'
                let actions = []
                dt.forEach((i,index) => {
                    if(i['Father_Comment_Id']!=null){
                        var action = ()=>{
                            return new Promise((resolve,reject)=>{
                                db.query(innersql,i['Father_Comment_Id'],(err,data)=>{
                                    if(err){
                                        reject(err)
                                    }else{
                                        saver[index].Parrent_Comment_Content=data[0]
                                        resolve()                         
                                    }
                                })
                            })
                        }
                        actions.push(action())
                    }
                });
                Promise.all(actions).then(res=>{
                    insres.send(saver)
                }).catch(err=>{
                    console.log(err)
                    insres.end()
                })
            }
            else{
                insres.send(dt)
            }
        }
    })
})
//获取正常 过审 状态留言板评论列表数量
admin.get('/activemessagecommentscount', (req, res) => {
    let sql = 'select count(*) as count from comments_message where Comment_Status=1 and Comment_Examined=1'
    chainFecth(sql)
    .then(data=>{
        res.send(data)
    })
    .catch(err=>{
        console.log(err)
        res.end()
    })
})

//获取冻结 过审状态留言板评论列表
admin.post('/frozenmessagecommentslist', (req, res) => {
    let st = Number(req.body.start)
    let len = Number(req.body.length)
    let sql = '(select * from comments_message where Comment_Status=2 and Comment_Examined=1  order by Id desc)  limit ?,?'
    db.query(sql, [st, len], (err, data) => {
        if (err) {
            console.log(err)
            res.end()
        } else {
            res.send(data)
        }
    })
})
//获取冻结 过审 状态留言板评论列表数量
admin.get('/frozenmessagecommentscount', (req, res) => {
    let sql = 'select count(*) as count from comments_message where Comment_Status=2 and Comment_Examined=1'
    chainFecth(sql)
    .then(data=>{
        res.send(data)
    })
    .catch(err=>{
        console.log(err)
        res.end()
    })
})
//冻结博客评论
admin.post('/frozenblogcomment', (req, res) => {
    let Comment_Id = String(req.body.Comment_Id)
    let sql = 'update comments_blogs set Comment_Status=2 where Comment_Id=?'
    chainFecth(sql,Comment_Id).then(data=>{
        res.send(data)
    }).catch(err=>{
        console.log(err)
        res.end()
    })
})
// 解冻 博客评论
admin.post('/unfrozenblogcomment', (req, res) => {
    let Comment_Id = String(req.body.Comment_Id)
    let sql = 'update comments_blogs set Comment_Status=1 where Comment_Id=?'
    chainFecth(sql,Comment_Id).then(data=>{
        res.send(data)
    }).catch(err=>{
        console.log(err)
        res.end()
    })
})
//删除 博客评论
admin.post('/deleteblogcomment', (req, res) => {
    let Comment_Id = String(req.body.Comment_Id)
    let sql = 'update comments_blogs set Comment_Status=0 where Comment_Id=?'
    chainFecth(sql,Comment_Id).then(data=>{
        res.send(data)
    }).catch(err=>{
        console.log(err)
        res.end()
    })
})
//冻结留言板回复
admin.post('/frozenmessagecomment', (req, res) => {
    let Comment_Id = String(req.body.Comment_Id)
    let sql = 'update comments_message set Comment_Status=2 where Comment_Id=?'
    chainFecth(sql,Comment_Id).then(data=>{
        res.send(data)
    }).catch(err=>{
        console.log(err)
        res.end()
    })
})
// 解冻留言板回复
admin.post('/unfrozenmessagecomment', (req, res) => {
    let Comment_Id = String(req.body.Comment_Id)
    let sql = 'update comments_message set Comment_Status=1 where Comment_Id=?'
    chainFecth(sql,Comment_Id).then(data=>{
        res.send(data)
    }).catch(err=>{
        console.log(err)
        res.end()
    })
})
//删除 留言板回复
admin.post('/deletemessagecomment', (req, res) => {
    let Comment_Id = String(req.body.Comment_Id)
    let sql = 'update comments_message set Comment_Status=0 where Comment_Id=?'
    chainFecth(sql,Comment_Id).then(data=>{
        res.send(data)
    }).catch(err=>{
        console.log(err)
        res.end()
    })
})


//获取预审 Comment_Exmined=0 状态博客评论列表
admin.post('/preexminedblogcommentlist', (req, res) => {
    let insres = res
    let start = Number(req.body.start)
    let length = Number(req.body.length)
    let sql = '(select * from comments_blogs where Comment_Examined=0 and Comment_Status=1 order by Id desc ) limit ?,?'
    chainFecth(sql,[start,length]).then(dt=>{
        // res.send(data)
        // console.log(data)
        
        if(dt.length!=0){
            let saver = dt
            let innersql = 'select Comment_Content  from comments_blogs where Comment_Id=?'
            let actions = []
            dt.forEach((i,index) => {
                if(i['Father_Comment_Id']!=null){
                    var action = ()=>{
                        return new Promise((resolve,reject)=>{
                            db.query(innersql,i['Father_Comment_Id'],(err,data)=>{
                                if(err){
                                    reject(err)
                                }else{
                                    saver[index].Parrent_Comment_Content=data[0]
                                    resolve()                         
                                }
                            })
                        })
                    }
                    actions.push(action())
                }
            });
            Promise.all(actions).then(res=>{
                insres.send(saver)
            }).catch(err=>{
                console.log(err)
                insres.end()
            })
        }
        else{
            insres.send(dt)
        }

    }).catch(err=>{
        console.log(err)
        insres.end()
    })
})
//获取预审 Comment_Exmined=0 状态留言板列表
admin.post('/preexminedmessagecommentlist', (req, res) => {
    // let start = Number(req.body.start)
    // let length = Number(req.body.length)
    // let sql = '(select * from comments_message where Comment_Examined=0 and Comment_Status=1  order by Id desc ) limit ?,?'
    // chainFecth(sql,[start,length]).then(data=>{
    //     res.send(data)
    // }).catch(err=>{
    //     console.log(err)
    //     res.end()
    // })
    let insres = res
    let start = Number(req.body.start)
    let length = Number(req.body.length)
    let sql = '(select * from comments_message where Comment_Examined=0 and Comment_Status=1 order by Id desc ) limit ?,?'
    chainFecth(sql,[start,length]).then(dt=>{
        // res.send(data)
        // console.log(data)
        
        if(dt.length!=0){
            let saver = dt
            let innersql = 'select Comment_Content  from comments_message where Comment_Id=?'
            let actions = []
            dt.forEach((i,index) => {
                if(i['Father_Comment_Id']!=null){
                    var action = ()=>{
                        return new Promise((resolve,reject)=>{
                            db.query(innersql,i['Father_Comment_Id'],(err,data)=>{
                                if(err){
                                    reject(err)
                                }else{
                                    saver[index].Parrent_Comment_Content=data[0]
                                    resolve()                         
                                }
                            })
                        })
                    }
                    actions.push(action())
                }
            });
            Promise.all(actions).then(res=>{
                insres.send(saver)
            }).catch(err=>{
                console.log(err)
                insres.end()
            })
        }
        else{
            insres.send(dt)
        }

    }).catch(err=>{
        console.log(err)
        insres.end()
    })
})
//获取预审 Comment_Exmined=0 状态博客评论count
admin.get('/preexminedblogcommentcount', (req, res) => {
    let sql = 'select count(*) as count from comments_blogs where Comment_Examined=0 and Comment_Status=1 '
    chainFecth(sql).then(data=>{
        res.send(data)
    }).catch(err=>{
        console.log(err)
        res.end()
    })
})
//获取预审 Comment_Exmined=0 状态留言板count
admin.get('/preexminedmessagecommentcount', (req, res) => {
    let sql = 'select count(*) as count from comments_message where Comment_Examined=0 and Comment_Status=1 '
    chainFecth(sql).then(data=>{
        res.send(data)
    }).catch(err=>{
        console.log(err)
        res.end()
    })
})
//获取未过审 Comment_Exmined=2 状态博客评论列表
admin.post('/fallenblogcommentlist', (req, res) => {
    let insres = res
    let start = Number(req.body.start)
    let length = Number(req.body.length)
    let sql = '(select * from comments_blogs where Comment_Examined=2 and Comment_Status=1  order by Id desc ) limit ?,?'
    chainFecth(sql,[start,length]).then(dt=>{
        if(dt.length!=0){
            let saver = dt
            let innersql = 'select Comment_Content  from comments_blogs where Comment_Id=?'
            let actions = []
            dt.forEach((i,index) => {
                if(i['Father_Comment_Id']!=null){
                    var action = ()=>{
                        return new Promise((resolve,reject)=>{
                            db.query(innersql,i['Father_Comment_Id'],(err,data)=>{
                                if(err){
                                    reject(err)
                                }else{
                                    saver[index].Parrent_Comment_Content=data[0]
                                    resolve()                         
                                }
                            })
                        })
                    }
                    actions.push(action())
                }
            });
            Promise.all(actions).then(res=>{
                insres.send(saver)
            }).catch(err=>{
                console.log(err)
                insres.end()
            })
        }
        else{
            insres.send(dt)
        }

        
    }).catch(err=>{
        console.log(err)
        insres.end()
    })
})
//获取未过审 Comment_Exmined=2 状态留言板列表
admin.post('/fallenmessagecommentlist', (req, res) => {
    // let start = Number(req.body.start)
    // let length = Number(req.body.length)
    // let sql = '(select * from comments_message where Comment_Examined=2 and Comment_Status=1  order by Id desc ) limit ?,?'
    // chainFecth(sql,[start,length]).then(data=>{
    //     res.send(data)
    // }).catch(err=>{
    //     console.log(err)
    //     res.end()
    // })
    let insres = res
    let start = Number(req.body.start)
    let length = Number(req.body.length)
    let sql = '(select * from comments_message where Comment_Examined=2 and Comment_Status=1  order by Id desc ) limit ?,?'
    chainFecth(sql,[start,length]).then(dt=>{
        if(dt.length!=0){
            let saver = dt
            let innersql = 'select Comment_Content  from comments_message where Comment_Id=?'
            let actions = []
            dt.forEach((i,index) => {
                if(i['Father_Comment_Id']!=null){
                    var action = ()=>{
                        return new Promise((resolve,reject)=>{
                            db.query(innersql,i['Father_Comment_Id'],(err,data)=>{
                                if(err){
                                    reject(err)
                                }else{
                                    saver[index].Parrent_Comment_Content=data[0]
                                    resolve()                         
                                }
                            })
                        })
                    }
                    actions.push(action())
                }
            });
            Promise.all(actions).then(res=>{
                insres.send(saver)
            }).catch(err=>{
                console.log(err)
                insres.end()
            })
        }
        else{
            insres.send(dt)
        }

        
    }).catch(err=>{
        console.log(err)
        insres.end()
    })
})
//获取未过审 Comment_Exmined=2 状态博客评论count
admin.get('/fallenblogcommentcount', (req, res) => {
    let sql = 'select count(*) as count from comments_blogs where Comment_Examined=2 and Comment_Status=1 '
    chainFecth(sql).then(data=>{
        res.send(data)
    }).catch(err=>{
        console.log(err)
        res.end()
    })
})
//获取未过审 Comment_Exmined=2 状态留言板count
admin.get('/fallenmessagecommentcount', (req, res) => {
    let sql = 'select count(*) as count from comments_message where Comment_Examined=2 and Comment_Status=1 '
    chainFecth(sql).then(data=>{
        res.send(data)
    }).catch(err=>{
        console.log(err)
        res.end()
    })
})
//博客评论通过审核
admin.post('/exmineadmitblogcomment', (req, res) => {
    let Comment_Id = String(req.body.Comment_Id)
    let sql = 'update comments_blogs set Comment_Examined=1 where Comment_Id=? and Comment_Status=1 '
    chainFecth(sql,Comment_Id).then(data=>{
        res.send(data)
    }).catch(err=>{
        console.log(err)
        res.end()
    })
})
//博客评论  不通过审核
admin.post('/exminerefuseblogcomment', (req, res) => {
    let Comment_Id = String(req.body.Comment_Id)
    let sql = 'update comments_blogs set Comment_Examined=2 where Comment_Id=? and Comment_Status=1 '
    chainFecth(sql,Comment_Id).then(data=>{
        res.send(data)
    }).catch(err=>{
        console.log(err)
        res.end()
    })
})
//留言板留言通过审核
admin.post('/exmineadmitmessagecomment', (req, res) => {
    let Comment_Id = String(req.body.Comment_Id)
    let sql = 'update comments_message set Comment_Examined=1 where Comment_Id=? and Comment_Status=1 '
    chainFecth(sql,Comment_Id).then(data=>{
        res.send(data)
    }).catch(err=>{
        console.log(err)
        res.end()
    })
})
//留言板留言  不通过审核
admin.post('/exminerefusemessagecomment', (req, res) => {
    let Comment_Id = String(req.body.Comment_Id)
    let sql = 'update comments_message set Comment_Examined=2 where Comment_Id=? and Comment_Status=1 '
    chainFecth(sql,Comment_Id).then(data=>{
        res.send(data)
    }).catch(err=>{
        console.log(err)
        res.end()
    })
})

//博客评论 或留言板 通过审核（多选）
admin.post('/multi/exmineadmitcomment', (req, res) => {
    //操作条件
    let condition = String(req.body.activeName) 
    let Comment_Id_List = req.body.Comment_Id_List
    let actions = []
    let sql = ''
    // console.log(condition)
    // console.log(Comment_Id_List)
    if(condition == 'preexmine_blogcomment'){
        sql = 'update comments_blogs set Comment_Examined=1 where Comment_Id=? and Comment_Status=1 '
    }
    else if(condition == 'preexmine_messagecomment'){
        sql = 'update comments_message set Comment_Examined=1 where Comment_Id=? and Comment_Status=1 '
    }
    
    Comment_Id_List.map(v=>{
        let action = ()=>{
            return new Promise((resolve,reject)=>{
                chainFecth(sql,v)
                .then(data=>{
                    resolve()
                })
                .catch(err=>{
                    reject(err)
                })
            })
        }
        actions.push(action())
    })
    Promise.all(actions)
    .then(data=>{
        res.send(data)
    })
    .catch(err=>{
        console.log(err)
        res.end()
    })
})
//博客评论 或留言板 不通过审核（多选）
admin.post('/multi/exminerefusecomment', (req, res) => {
     //操作条件
     let condition = String(req.body.activeName) 
     let Comment_Id_List = req.body.Comment_Id_List
     let actions = []
     let sql = ''
     if(condition == 'preexmine_blogcomment'){
         sql = 'update comments_blogs set Comment_Examined=2 where Comment_Id=? and Comment_Status=1 '
     }
     else if(condition == 'preexmine_messagecomment'){
         sql = 'update comments_message set Comment_Examined=2 where Comment_Id=? and Comment_Status=1 '
     }
    Comment_Id_List.map(v=>{
        let action = ()=>{
            return new Promise((resolve,reject)=>{
                chainFecth(sql,v)
                .then(data=>{
                    resolve()
                })
                .catch(err=>{
                    reject(err)
                })
            })
        }
        actions.push(action())
    })
    Promise.all(actions)
    .then(data=>{
        res.send(data)
    })
    .catch(err=>{
        console.log(err)
        res.end()
    })
})
  //********用户 */
//获取所有正常 审核成功状态用户列表User_Status=1 User_Examined=1
admin.post('/activeuserlist',(req,res)=>{
    let start = Number(req.body.start)
    let length = Number(req.body.length)
    let sql = '(select * from user_table where User_Status=1 and User_Examined=1 and Role="User" order by Id desc ) limit ?,?'
    chainFecth(sql,[start,length])
        .then(data=>{
            res.send(data)
        })
        .catch(err=>{
            console.log(err)
            res.end()
        })
})
//count
admin.get('/activeusercount',(req,res)=>{
    let sql = 'select count(*) as count from user_table where User_Status=1 and User_Examined=1 and Role="User"'
    chainFecth(sql)
        .then(data=>{
            res.send(data)
        })
        .catch(err=>{
            console.log(err)
            res.end()
        })
})
//获取所有冻结 审核成功状态用户列表User_Status=2 User_Examined=1
admin.post('/frozenuserlist',(req,res)=>{
    let start = Number(req.body.start)
    let length = Number(req.body.length)
    let sql = '(select * from user_table where User_Status=2 and User_Examined=1 order by Id desc ) limit ?,?'
    chainFecth(sql,[start,length])
        .then(data=>{
            res.send(data)
        })
        .catch(err=>{
            console.log(err)
            res.end()
        })
})
//count
admin.get('/frozenusercount',(req,res)=>{
    let sql = 'select count(*) as count from user_table where User_Status=2 and User_Examined=1'
    chainFecth(sql)
        .then(data=>{
            res.send(data)
        })
        .catch(err=>{
            console.log(err)
            res.end()
        })
})
//冻结账户 
admin.post('/frozenuser',(req,res)=>{
    let User_UniqueId = String(req.body.User_UniqueId)
    let sql = 'update user_table set User_Status=2 where User_UniqueId=?'
    chainFecth(sql,User_UniqueId)
        .then(data=>{
            res.send(data)
        })
        .catch(err=>{
            console.log(err)
            res.end()
        })
})
//解冻账户 
admin.post('/unfrozenuser',(req,res)=>{
    let User_UniqueId = String(req.body.User_UniqueId)
    let sql = 'update user_table set User_Status=1 where User_UniqueId=?'
    chainFecth(sql,User_UniqueId)
        .then(data=>{
            res.send(data)
        })
        .catch(err=>{
            console.log(err)
            res.end()
        })
})
//注销账户
admin.post('/deleteuser',(req,res)=>{
    let User_UniqueId = String(req.body.User_UniqueId)
    let sql = 'update user_table set User_Status=0 where User_UniqueId=?'
    chainFecth(sql,User_UniqueId)
        .then(data=>{
            res.send(data)
        })
        .catch(err=>{
            console.log(err)
            res.end()
        })
})
//修改用户信息
admin.post('/updateuserinfo',(req,res)=>{
    let User_Nickname = req.body.User_Nickname
    let User_Password = req.body.User_Password
    let User_Email = req.body.User_Email
    // let User_PhoneNumber = Number(req.body.User_PhoneNumber)
    let User_PhoneNumber = req.body.User_PhoneNumber
    let User_Introduction = req.body.User_Introduction
    let User_UniqueId = req.body.User_UniqueId

    let sql = 'update user_table set User_Nickname=?,User_Password=?,User_Email=?,'
    +'User_PhoneNumber=?,User_Introduction=? where User_UniqueId=?'
    chainFecth(sql,[User_Nickname,User_Password,User_Email,User_PhoneNumber,User_Introduction,User_UniqueId])
    .then(data=>{

        let innersql1 = 'update comments_blogs set Comment_Person_Name=? where Comment_Person_Id=?'
        let innersql2 = 'update comments_blogs set Parent_Person_Name=? where Parent_Person_Id=?'
        let innersql3 = 'update comments_message set Comment_Person_Name=? where Comment_Person_Id=?'
        let innersql4 = 'update comments_message set Parent_Person_Name=? where Parent_Person_Id=?'
        let innersql5 = 'update blogs set Blog_Author=? where Blog_Author_UniqueId=?'
        let innersql6 = 'update message set Message_Author=? where Message_Author_UniqueId=?'
        let sqlarry = [innersql1,innersql2,innersql3,innersql4,innersql5,innersql6]
        let actions=[]
            sqlarry.map((v,index)=>{
                let action = ()=>{
                    return new Promise((resolve,reject)=>{
                        chainFecth(v,[User_Nickname,User_UniqueId]).then(res=>{resolve(res)}).catch(err=>{reject(err)})
                    })
                }
                actions.push(action())
            })
            Promise.all(actions).then(resp=>{
                res.send({
                    msg:'更新成功',
                    callback:resp
                })
            }).catch(error=>{console.log(error)})
        // res.send(data)
    })
    .catch(err=>{
        console.log(err)
        res.end()
    })
})


//获取所有正常 审核成功状态一般管理员列表User_Status=1 User_Examined=1
admin.post('/activeadminuserlist',(req,res)=>{
    let start = Number(req.body.start)
    let length = Number(req.body.length)
    let sql = '(select * from admin_table where Admin_Status=1 and Admin_Examined=1 and Admin_Role!="Admin" order by Id desc ) limit ?,?'
    chainFecth(sql,[start,length])
        .then(data=>{
            res.send(data)
        })
        .catch(err=>{
            console.log(err)
            res.end()
        })
})
//count
admin.get('/activeadminusercount',(req,res)=>{
    let sql = 'select count(*) as count from admin_table where Admin_Status=1 and Admin_Examined=1 and Admin_Role!="Admin"'
    chainFecth(sql)
        .then(data=>{
            res.send(data)
        })
        .catch(err=>{
            console.log(err)
            res.end()
        })
})
//获取所有冻结 审核成功状态一般管理员列表User_Status=2 User_Examined=1
admin.post('/frozenadminuserlist',(req,res)=>{
    let start = Number(req.body.start)
    let length = Number(req.body.length)
    let sql = '(select * from admin_table where Admin_Status=2 and Admin_Examined=1 and Admin_Role!="Admin" order by Id desc ) limit ?,?'
    chainFecth(sql,[start,length])
        .then(data=>{
            res.send(data)
        })
        .catch(err=>{
            console.log(err)
            res.end()
        })
})
//count
admin.get('/frozenadminusercount',(req,res)=>{
    let sql = 'select count(*) as count from admin_table where Admin_Status=2 and Admin_Examined=1 and Admin_Role!="Admin"'
    chainFecth(sql)
        .then(data=>{
            res.send(data)
        })
        .catch(err=>{
            console.log(err)
            res.end()
        })
})
//冻结管理员账户
admin.post('/frozenadminuser',(req,res)=>{
    let Admin_UniqueId = String(req.body.Admin_UniqueId)
    let sql = 'update admin_table set Admin_Status=2 where Admin_UniqueId=? and Admin_Role!="Admin"'
    chainFecth(sql,Admin_UniqueId)
        .then(data=>{
            res.send(data)
        })
        .catch(err=>{
            console.log(err)
            res.end()
        })
})
//解冻管理员账户 
admin.post('/unfrozenadminuser',(req,res)=>{
    let Admin_UniqueId = String(req.body.Admin_UniqueId)
    let sql = 'update admin_table set Admin_Status=1 where Admin_UniqueId=? and Admin_Role!="Admin"'
    chainFecth(sql,Admin_UniqueId)
        .then(data=>{
            res.send(data)
        })
        .catch(err=>{
            console.log(err)
            res.end()
        })
})
//注销管理员账户
admin.post('/deleteadminuser',(req,res)=>{
    let Admin_UniqueId = String(req.body.Admin_UniqueId)
    let sql = 'update admin_table set Admin_Status=0 where Admin_UniqueId=? and Admin_Role!="Admin"'
    chainFecth(sql,Admin_UniqueId)
        .then(data=>{
            res.send(data)
        })
        .catch(err=>{
            console.log(err)
            res.end()
        })
})
//修改管理员信息
admin.post('/updateadmininfo',(req,res)=>{
    let Admin_Nickname = req.body.Admin_Nickname
    let Admin_Password = req.body.Admin_Password
    let Admin_Email = req.body.Admin_Email
    let Admin_PhoneNumber = Number(req.body.Admin_PhoneNumber)
    let Admin_Introduction = req.body.Admin_Introduction
    let Admin_Role = req.body.Admin_Role
    let Admin_UniqueId = req.body.Admin_UniqueId


    let sql = 'update admin_table set Admin_Nickname=?,Admin_Password=?,Admin_Email=?,'
    +'Admin_PhoneNumber=?,Admin_Introduction=?,Admin_Role=? where Admin_UniqueId=? and Admin_Role!="Admin"'
    chainFecth(sql,[Admin_Nickname,Admin_Password,Admin_Email,Admin_PhoneNumber,Admin_Introduction,Admin_Role,Admin_UniqueId])
    .then(data=>{
        res.send(data)
    })
    .catch(err=>{
        console.log(err)
        res.end()
    })
})



//获取所有预审状态 用户注册列表
admin.post('/preexamineduserlist', (req, res) => {
    let start = Number(req.body.start)
    let length = Number(req.body.length)
    let sql = '(select * from user_table where User_Examined=0 and User_Status=1  order by Id desc ) limit ?,?'
    chainFecth(sql,[start,length]).then(data=>{
        res.send(data)
    }).catch(err=>{
        console.log(err)
        res.end()
    })
})
//count
admin.get('/preexaminedusercount',(req,res)=>{
    let sql = 'select count(*) as count from user_table where User_Status=1 and User_Examined=0'
    chainFecth(sql)
        .then(data=>{
            res.send(data)
        })
        .catch(err=>{
            console.log(err)
            res.end()
        })
})
//未过审 用户注册列表
admin.post('/fallenexamineduserlist', (req, res) => {
    let start = Number(req.body.start)
    let length = Number(req.body.length)
    let sql = '(select * from user_table where User_Examined=2 and User_Status=1  order by Id desc ) limit ?,?'
    chainFecth(sql,[start,length]).then(data=>{
        res.send(data)
    }).catch(err=>{
        console.log(err)
        res.end()
    })
})
//未过审count
admin.get('/fallenexaminedusercount',(req,res)=>{
    let sql = 'select count(*) as count from user_table where User_Status=1 and User_Examined=2'
    chainFecth(sql)
        .then(data=>{
            res.send(data)
        })
        .catch(err=>{
            console.log(err)
            res.end()
        })
})
//同意过审
admin.post('/examineadmituser', (req, res) => {
    let User_UniqueId = String(req.body.User_UniqueId)
    let sql = 'update user_table set User_Examined=1 where User_UniqueId=?'
    chainFecth(sql,User_UniqueId).then(data=>{
        res.send(data)
    }).catch(err=>{
        console.log(err)
        res.end()
    })
})
//拒绝过审
admin.post('/examinerefuseuser', (req, res) => {
    let User_UniqueId = String(req.body.User_UniqueId)
    let sql = 'update user_table set User_Examined=2 where User_UniqueId=?'
    chainFecth(sql,User_UniqueId).then(data=>{
        res.send(data)
    }).catch(err=>{
        console.log(err)
        res.end()
    })
})
//删除该用户
//上面已经写过了

//获取所有预审状态 管理员注册列表
admin.post('/preexaminedadminlist', (req, res) => {
    let start = Number(req.body.start)
    let length = Number(req.body.length)
    let sql = '(select * from admin_table where Admin_Examined=0 and Admin_Status=1  order by Id desc ) limit ?,?'
    chainFecth(sql,[start,length]).then(data=>{
        res.send(data)
    }).catch(err=>{
        console.log(err)
        res.end()
    })
})
//count
admin.get('/preexaminedadmincount',(req,res)=>{
    let sql = 'select count(*) as count from admin_table where Admin_Status=1 and Admin_Examined=0'
    chainFecth(sql)
        .then(data=>{
            res.send(data)
        })
        .catch(err=>{
            console.log(err)
            res.end()
        })
})
//未过审 管理员注册列表
admin.post('/fallenexaminedadminlist', (req, res) => {
    let start = Number(req.body.start)
    let length = Number(req.body.length)
    let sql = '(select * from admin_table where Admin_Examined=2 and Admin_Status=1  order by Id desc ) limit ?,?'
    chainFecth(sql,[start,length]).then(data=>{
        res.send(data)
    }).catch(err=>{
        console.log(err)
        res.end()
    })
})
//未过审count
admin.get('/fallenexaminedadmincount',(req,res)=>{
    let sql = 'select count(*) as count from admin_table where Admin_Status=1 and Admin_Examined=2'
    chainFecth(sql)
        .then(data=>{
            res.send(data)
        })
        .catch(err=>{
            console.log(err)
            res.end()
        })
})
//同意过审
admin.post('/examineadmitadmin', (req, res) => {
    let Admin_UniqueId = String(req.body.Admin_UniqueId)
    let sql = 'update admin_table set Admin_Examined=1 where Admin_UniqueId=?'
    chainFecth(sql,Admin_UniqueId).then(data=>{
        res.send(data)
    }).catch(err=>{
        console.log(err)
        res.end()
    })
})
//拒绝过审
admin.post('/examinerefuseadmin', (req, res) => {
    let Admin_UniqueId = String(req.body.Admin_UniqueId)
    let sql = 'update user_table set Admin_Examined=2 where Admin_UniqueId=?'
    chainFecth(sql,Admin_UniqueId).then(data=>{
        res.send(data)
    }).catch(err=>{
        console.log(err)
        res.end()
    })
})
//删除管理员  上面已经实现了

//添加用户
admin.post('/addoneuser', (req, res) => {
    let nickname = req.body.userinfo.User_Nickname
    let account = req.body.userinfo.User_Account
    let password = req.body.userinfo.User_Password
    let email = req.body.userinfo.User_Email
    let user_uniqueid = randomId(16)
    let phone = req.body.userinfo.User_PhoneNumber
    let introduction = req.body.userinfo.User_Introduction

    let outsql = 'select count(*) as count from user_table where User_Account=?'
    chainFecth(outsql,account)
    .then(data=>{
        if(data[0].count == 1){
            // console.log('该账号已存在！')
            res.send({
                msg:'该账号已存在！',
                code:51
            })
            return
        }
        else{
            let sql = 'insert into user_table (User_UniqueId,User_Nickname,User_Account,User_Password,User_Email,User_PhoneNumber,User_Introduction) values '+
            '(?,?,?,?,?,?,?)'
            let mix = [
                user_uniqueid,
                nickname,
                account,
                password,
                email,
                phone,
                introduction
            ]
            chainFecth(sql,mix).then(dt=>{
                res.send({
                    msg:'添加用户成功！',
                    code:50
                })
            }).catch(err=>{
                console.log(err)
                res.send({
                    msg:'添加用户失败！',
                    code:52
                })
            })
        }
    }).catch(err=>{
        console.log(err)
        res.send({
            msg:'添加用户失败！',
            code:52
        })
    })
        
})
//添加管理员
admin.post('/addoneadmin', (req, res) => {
    let nickname = req.body.userinfo.Admin_Nickname
    let account = req.body.userinfo.Admin_Account
    let password = req.body.userinfo.Admin_Password
    let role = req.body.userinfo.Admin_Role
    let email = req.body.userinfo.Admin_Email
    let user_uniqueid = randomId(16)
    let phone = req.body.userinfo.Admin_PhoneNumber
    let introduction = req.body.userinfo.Admin_Introduction

    let outsql = 'select count(*) as count from admin_table where Admin_Account=?'
    chainFecth(outsql,account)
    .then(data=>{
        if(data[0].count == 1){
            // console.log('该账号已存在！')
            res.send({
                msg:'该账号已存在！',
                code:56
            })
            return
        }
        else{
            let sql = 'insert into admin_table (Admin_Role,Admin_UniqueId,Admin_Nickname,Admin_Account,Admin_Password,Admin_Email,Admin_PhoneNumber,Admin_Introduction) values '+
            '(?,?,?,?,?,?,?,?)'
            let mix = [
                role,
                user_uniqueid,
                nickname,
                account,
                password,
                email,
                phone,
                introduction
            ]
            chainFecth(sql,mix).then(dt=>{
                res.send({
                    msg:'添加管理员成功！',
                    code:55
                })
            }).catch(err=>{
                console.log(err)
                res.send({
                    msg:'添加管理员失败！',
                    code:57
                })
            })
        }
    }).catch(err=>{
        console.log(err)
        res.send({
            msg:'添加管理员失败！',
            code:57
        })
    })
        
})


        //网站管理
//获取所有tag  => alltagslist

//获取所有class  => allclasslist

//更新 修改tags
admin.post('/updatetaglist', (req, res) => {
    let Tag_List = req.body.Tag_List
    let sql = 'update website set Tag_List=? where Id=1'
    chainFecth(sql,Tag_List).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})
//更新 修改class
admin.post('/updateclasslist', (req, res) => {
    let Class_List = req.body.Class_List
    let sql = 'update website set Class_List=? where Id=1'
    chainFecth(sql,Class_List).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})


//获取about表 所有内容
admin.get('/allaboutpage', (req, res) => {
    let sql = 'select * from about where Id=1'
    chainFecth(sql).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})
//修改 更新about表(不含图片)
admin.post('/updateabout', (req, res) => {
    let About_Tittle = req.body.About_Tittle
    let About_Content = req.body.About_Content
    let sql = 'update about set About_Tittle=?,About_Content=?  where Id=1'
    chainFecth(sql,[About_Tittle,About_Content]).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})


//about message backgorond avatar页面根据condition上传图片(共用)
admin.post('/uploadwebsiteimg', (req, res) => {
    let form = new formidable.IncomingForm();               
    let maxsize = 5 * 1024 * 1024    //5M
    try{
        form.parse(req, function (err, fields, files) {
            // console.log(fields)
            // console.log(files)
             // const Blog_Id = fields.Blog_Id
            let condition = fields.condition
            // console.log('upload condition===>'+condition)
            let createdfilename =''
            if(condition=='about'){
                createdfilename = './public/aboutimgs'
            }
            else if(condition=='message'){
                createdfilename = './public/messageimgs'
            }
            else if(condition=='background'){
                createdfilename = './public/backgroundimgs'
            }
            else if(condition=='avatar'){
                createdfilename = './public/avatars'
            }
             console.log(condition)
            execUpdateImage(maxsize,files,createdfilename,res)  
        })
    }catch(err){
        console.log(err)
        res.send({
            message:'出错了:'+err,
        })
        return
    }

})
//上传图片后
//更新对应图片路径(共用)
admin.post('/updatewebsiteimgpath', (req, res) => {
    let identification = req.body.identification
    let image_path = String(req.body.image_path)+','
    console.log('identification===>'+identification)
    console.log('image_path===>'+image_path)

    let sql = ''
    if(identification =='about'){
        sql = 'update about set About_Img=CONCAT(About_Img,?) where Id=1'
    }
    else if(identification =='message'){
        sql = 'update message set Message_Img=CONCAT(Message_Img,?) where Id=1'
    }
    else if(identification =='background'){
        sql = 'update website set Backgroung_Img=? where Id=1'
    }
    else if(identification =='avatar'){
        sql = 'update website set Avatars=CONCAT(Avatars,?) where Id=1'
    }
    chainFecth(sql,image_path)
    .then(data=>{
        res.send({
            message:'图片路径插入成功！',
        })
    })
    .catch(err=>{
        res.send({
            message:'图片路径插入失败！',
        })
    })

})
//更新图片地址 
//并删除服务器图片(共用)
admin.post('/deletewebsiteimg', (req, res) => {   
    let Identification = String(req.body.Identification)
    let Instance = String(req.body.Instance).split(',')
    let ImgPath = String(req.body.ImgPath)
    let sql =''
    // console.log(Identification)
    // console.log(Instance)
    // console.log(ImgPath)
    //过滤Instance数组
    //2022.02.26 更改  return v != ImgPath  -》 return v != ImgPath && v!=''
    Instance = Instance.filter(v=>{
        return v != ImgPath && v!=''
    })
    if(Identification == 'background'){
        //background删除为清空
        Instance = ''
        sql = 'update website set Backgroung_Img =? where Id=1'
    }
    else if(Identification == 'about'){
        //about删除为替换
        if(Instance.length==0){
            Instance = ''
        }else{
            Instance = Instance.toString()+','
        }
        sql = 'update about set About_Img = ? where Id=1'
    }
    else if(Identification == 'message'){
        //message删除为替换
        if(Instance.length==0){
            Instance = ''
        }else{
            Instance = Instance.toString()+','
        }
        sql = 'update message set Message_Img=? where Id=1'
    }
    else if(Identification == 'avatar'){
        if(Instance.length==0){
            Instance = ''
        }else{
            Instance = Instance.toString()+','
        }
        sql = 'update website set Avatars =? where Id=1'
    }
    
    setTimeout(()=>{
        chainFecth(sql,Instance).then(data=>{
            //再删除服务器对应图片
            
            if(data){
                const fullname = './public'+ImgPath
                if (fs.existsSync(fullname)) {
                    fs.unlink(fullname, function(err){
                        if(err){
                            throw err
                        }
                        else{
                            res.send({
                                message:'文件:'+ImgPath+'删除成功！',
                            })
                            return
                        }
                       })
                }else{
                    
                    console.log('文件不存在')
                    res.send({
                        message:'文件:'+ImgPath+'不存在',
                    })
                }
            }
        }).catch(err=>{
            res.send({
                message:'文件:'+ImgPath+'更新到数据库失败!',
                err:err,
            })
            console.log(err)
        })
    },0)

})


//获取message表 所有内容
admin.get('/allmessagepage', (req, res) => {
    let sql = 'select * from message where Id=1'
    chainFecth(sql).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})
//修改 更新message表(不含图片)
admin.post('/updatemessage', (req, res) => {
    let Message_Title = req.body.Message_Title
    let Message_Content = req.body.Message_Content
    let sql = 'update message set Message_Title=?,Message_Content=?  where Id=1'
    chainFecth(sql,[Message_Title,Message_Content]).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})

//获取网站背景图
admin.get('/getbackgroundimg', (req, res) => {
    let sql = 'select Backgroung_Img from website where Id=1'
    chainFecth(sql).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})
//修改 更新网站背景图
//上面已经整合了

//获取所有头像
admin.get('/getavatars', (req, res) => {
    let sql = 'select Avatars from website where Id=1'
    chainFecth(sql).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})
//获取广告页面
admin.get('/getadvertisement', (req, res) => {
    let sql = 'select Adv_Tittle,Adv_Introduction,Adv_Img_Link_Url from advertisement'
    chainFecth(sql).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})
//更新广告页面
admin.post('/updateadvertisement', (req, res) => {
    // console.log(req.body.information)
    let Adv_Tittle = req.body.information.Adv_Tittle
    let Adv_Introduction = req.body.information.Adv_Introduction
    let Adv_Img_Link_Url = req.body.information.Adv_Img_Link_Url

    let sql = 'update advertisement set Adv_Tittle=?,Adv_Introduction=?,Adv_Img_Link_Url=?'
    chainFecth(sql,[Adv_Tittle,Adv_Introduction,Adv_Img_Link_Url]).then(data=>{
        res.send(data)
    }).catch(err=>{console.log(err)})
})



        //权限
//获取所有角色名称（表：admin_table_right）
admin.get('/allrolenamelist', (req, res) => {
    let sql = 'select Admin_Role from admin_table_right where Admin_Role_Status=1 and Admin_Is_Creator!=1'
    chainFecth(sql).then(data=>{res.send(data)}).catch(err=>{console.log(err)})

})

//获取所有admin角色权限列表（表：admin_table_right）
admin.post('/adminrolelist', (req, res) => {
    let start = Number(req.body.start)
    let length = Number(req.body.length)
    let sql = '(select * from admin_table_right where Admin_Is_Creator!=1 order by Id ) limit ?,?'
    chainFecth(sql,[start,length]).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})
//获取所有admin角色权限列表 count
admin.get('/adminrolelistcount', (req, res) => {
    let sql = 'select count(*) as count from admin_table_right where Admin_Role_Status!=0 and Admin_Is_Creator!=1'
    chainFecth(sql).then(data=>{res.send(data)}).catch(err=>{console.log(err)})

})
//获取所有Tab_List
admin.get('/alltablist', (req, res) => {
    let sql = 'select Tab_List from website where Id=1'
    chainFecth(sql).then(data=>{res.send(data)}).catch(err=>{console.log(err)})

})
//根据 Role 获取对应身份的 Tab_List (side bar)
admin.post('/gettablistbyrole', (req, res) => {
    let Role = req.body.Role
    let sql = 'select Admin_Tab_List from admin_table_right where Admin_Role=? and Admin_Role_Status=1'
    chainFecth(sql,Role).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})


//停用某角色
admin.post('/stoprole', (req, res) => {
    let Admin_Role_Id = req.body.Admin_Role_Id
    let sql = 'update admin_table_right set Admin_Role_Status=2 where Admin_Role_Id=?'
    chainFecth(sql,Admin_Role_Id).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})
//启用某角色
admin.post('/startrole', (req, res) => {
    let Admin_Role_Id = req.body.Admin_Role_Id
    let sql = 'update admin_table_right set Admin_Role_Status=1 where Admin_Role_Id=?'
    chainFecth(sql,Admin_Role_Id).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})
//删除某角色
admin.post('/deleterole', (req, res) => {
    let Admin_Role_Id = req.body.Admin_Role_Id
    let sql = 'update admin_table_right set Admin_Role_Status=0 where Admin_Role_Id=?'
    chainFecth(sql,Admin_Role_Id).then(data=>{res.send(data)}).catch(err=>{console.log(err)})
})

module.exports = admin