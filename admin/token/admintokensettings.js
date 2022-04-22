
const preset = {
    secret : 'suibianxiede123',

    //token 刷新时间 单位：秒
    refresh_time : 60*10,
    //token 可用最大时间 单位：秒
    access_time : 60*60*24*5, //5天


    //token 最大不禁用持续时长，超过设置时长，旧token也必须重新登录
    //即 设置时间内，没有使用过该token，该token也会失效
    forbidden_time : 60*60*24*2 //2天
}

module.exports = {
    preset
}