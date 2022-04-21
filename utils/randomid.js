let randomId = (l)=>{
  //默认参数
  let length =14
  if(l){
    length = l
  }
  let upperlater = "A,B,C,D,E,F,G,H,I,G,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z";
  let lowerlater = upperlater.toLowerCase();
  let number = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
  upperlater = upperlater.split(",");
  lowerlater = lowerlater.split(",");
  let arr = [upperlater, lowerlater, number];
  
  let saver = [];
  for (let i = 0; i < length; i++) {
    let arraychosener = Math.floor(Math.random() * (2 - 0 + 1) + 0); //返回0或1或2
    let laterchosener = Math.floor(Math.random() * (25 - 0 + 1) + 0); //返 0-25
    let numberchosener = Math.floor(Math.random() * (9 - 0 + 1) + 0);

    if (arraychosener==0 || arraychosener==1) {
      saver.push(arr[arraychosener][laterchosener]);
    }
    else
      saver.push(arr[arraychosener][numberchosener]);
  }
  saver = saver.toString().replace(/,/g,'')
  return  saver
}
module.exports = {
    randomId
}