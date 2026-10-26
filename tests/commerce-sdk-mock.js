// Only served in the guarded localhost QA edition, never packaged in dist.
window.Razorpay=class LocalCheckout {
 constructor(options){this.options=options;}
 open(){
  const root=document.createElement('div');root.id='qaCheckout';root.setAttribute('role','dialog');root.setAttribute('aria-label','Local mock checkout');
  root.dataset.orderId=this.options.order_id;
  Object.assign(root.style,{position:'fixed',inset:'10%',zIndex:'9999',background:'#20252d',color:'white',padding:'24px',border:'2px solid #ffc095',borderRadius:'20px',font:'16px system-ui'});
  const text=document.createElement('p');text.textContent=`Local mock checkout · ${(this.options.amount/100).toFixed(2)} ${this.options.currency}. No real payment.`;
  const complete=document.createElement('button');complete.id='qaCompletePayment';complete.textContent='Complete local test payment';Object.assign(complete.style,{minHeight:'48px',width:'100%',marginBottom:'16px'});
  complete.onclick=async()=>{complete.disabled=true;try{const response=await fetch('/__time-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'qa-commerce-capture',accountId:'11111111-1111-4111-8111-111111111111',orderId:this.options.order_id})});const payload=await response.json();if(!response.ok)throw Error(payload.error);root.remove();this.options.handler(payload);this.options.modal.ondismiss();}catch(error){text.textContent='Local mock failure: '+error.message;complete.disabled=false;}};
  const cancel=document.createElement('button');cancel.textContent='Close local mock';cancel.style.minHeight='48px';cancel.onclick=()=>{root.remove();this.options.modal.ondismiss();};root.append(text,complete,cancel);document.body.append(root);
 }
};
