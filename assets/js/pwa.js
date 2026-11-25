var chochoInstallPrompt=null;
function updateInstallButton(){var button=document.getElementById('pwaInstall');if(button)button.hidden=!chochoInstallPrompt}
if('serviceWorker' in navigator){
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('./sw.js').catch(function(){
      console.info('El modo instalable no esta disponible en esta vista local.');
    });
  });
}
window.addEventListener('beforeinstallprompt',function(event){event.preventDefault();chochoInstallPrompt=event;updateInstallButton()});
window.addEventListener('appinstalled',function(){chochoInstallPrompt=null;updateInstallButton()});
document.addEventListener('click',function(event){
  if(!event.target.matches('#pwaInstall')||!chochoInstallPrompt)return;
  chochoInstallPrompt.prompt();
  chochoInstallPrompt.userChoice.finally(function(){chochoInstallPrompt=null;updateInstallButton()});
});
window.addEventListener('load',updateInstallButton);
