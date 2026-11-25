window.ChochoSync={
  ensure:function(state){
    if(!state.sync)state.sync={pending:0,last:Date.now(),status:'synced'};
    return state.sync;
  },
  queue:function(state,order){
    var sync=this.ensure(state);
    if(order.sync==='pending')return;
    order.sync='pending';
    sync.pending++;
    sync.status='pending';
  },
  reconnect:function(state){
    var sync=this.ensure(state),count=0;
    state.orders.forEach(function(order){
      if(order.sync==='pending'){order.sync='synced';count++}
    });
    sync.pending=0;
    sync.last=Date.now();
    sync.status='synced';
    return count;
  },
  label:function(state){
    var sync=this.ensure(state);
    return sync.pending?sync.pending+' operación(es) pendientes':'Todo sincronizado';
  }
};
