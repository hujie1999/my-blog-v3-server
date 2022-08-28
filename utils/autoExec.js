const { db } = require('../data/database')

//配置项
const config={
    time:"24:00:00",//每天几点执行
    interval:1,//隔几天执行一次
    runNow:false//是否立即执行
};

 
//定时任务逻辑
const timerTask = function(user,tourist){
    // if(config.runNow){
    //     //如果配置了立刻运行则立刻运行任务函数
    //     todo();
    // }

     //获取下次要执行的时间，如果执行时间已经过了今天，就让把执行时间设到明天的按时执行的时间
     var nowTime=new Date().getTime();
     var timePoint=config.time.split(":").map(i=>parseInt(i));
     
     var recent =new Date().setHours(...timePoint);//获取执行时间的时间戳
     
     if(recent <= nowTime){
         recent+=24*60*60*1000;
     }
     
     //未来程序执行的时间减去现在的时间，就是程序要多少秒之后执行
     var doRunTime=recent-nowTime;
     setTimeout(function(){
         todo(user,tourist);
         //没隔多少天在执执行
         var intTime=config.interval*24*60*60*1000;
         setInterval(function(){
             todo(user,tourist);
         },intTime);
 
     },doRunTime);
 
}
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
//todo
const todo = function (user,tourist){
    console.log("程序执行了！");
    const user_count = user.size
    const tourist_count = tourist.size
    const total_count = user_count + tourist_count

    user.clear()
    tourist.clear()

    //存入数据库
    //每日访问量录入 view_data 表
    const sql = 'insert into view_data (total_view,user_view,tourist_view) values (?,?,?)'
    chainFecth(sql,[total_count,user_count,tourist_count])
        .then(data=>{console.log(`${new Date()}====> 昨日访问人数已存入数据库!\n 
            昨日浏览总数为：${ total_count }; \n
            注册用户访问量为：${ user_count }; \n
            游客浏览量为：${ tourist_count } 。
        `)})
        .catch(err=>{
            console.log('昨日访问人数存入数据库失败！原因： \n',err);
        })
    //更新网站总访问量
    const sql2 = 'update website set Viewer_Count = Viewer_Count+?'
    chainFecth(sql2,total_count)
        .then(data=>{console.log('昨日总访问人数已添加至网站访问人数！')})
        .catch(err=>{console.log('昨日总访问人数添加至网站访问人数失败！！原因： \n',err);})
}

module.exports = {
    timerTask
}

// weisite total  2170 
// view_data  empty