window.ChochoStorage={
  save:function(key,state){
    try{
      var copy=JSON.parse(JSON.stringify(state));
      copy.orders.forEach(function(order){order.photo=null;order.evidence=null});
      copy.faces={};
      copy.facePic={};
      localStorage.setItem(key,JSON.stringify(copy));
    }catch(error){}
  },
  load:function(key){
    try{
      var raw=localStorage.getItem(key);
      if(!raw)return null;
      var saved=JSON.parse(raw);
      return saved&&saved.orders&&saved.L?saved:null;
    }catch(error){
      localStorage.removeItem(key);
      return null;
    }
  },
  clear:function(key){localStorage.removeItem(key)}
};
