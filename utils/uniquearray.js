let uniqueArray = function(arr){
    let result = {};
    let finalResult=[];
    for(let i=0;i<arr.length;i++){
        //利用对象的键名无法重复的特点，Blog_Id是唯一区别的属性值
        //采用对象访问属性的方法，判断属性值是否存在，如果不存在就添加。
        result[arr[i]['Blog_Id']] ? '' : result[arr[i]['Blog_Id']] = true && finalResult.push(arr[i]);
    }
    //升序排序
    return finalResult.sort((a,b)=>{
    //    return  a['Blog_Id']-b['Blog_Id']
            return  b['Blog_Id']-a['Blog_Id']

    });
}
// let arr = [{},{},{}]
module.exports = {
    uniqueArray
}