import { icon, fillIcons } from './icons.mjs';
import { renderFlow } from './flows.mjs';

const tools = {
  regular:{name:'Regime regular',icon:'layers',theme:'forest',desc:'Veja a CBS e o IBS de uma venda ou prestação de serviço.',action:'Simular operação'},
  simples:{name:'Simples Nacional',icon:'store',theme:'blue',desc:'Estime os tributos sobre o consumo de uma operação do Simples.',action:'Simular no Simples'},
  danfse:{name:'PDF da NFS-e',icon:'file',theme:'honey',desc:'Transforme o XML de uma nota de serviço já emitida em PDF.',action:'Gerar documento'}
};
const titles={inicio:'Visão geral',historico:'Histórico da sessão',ajuda:'Central de ajuda',...Object.fromEntries(Object.entries(tools).map(([k,v])=>[k,v.name]))};
const host=document.querySelector('#route'), modal=document.querySelector('#chooser');
const availability={regular:false,simples:false,danfse:false};
const statusReady=(async()=>{
  if(document.querySelector('meta[name="mesa-edicao"]'))return;
  try {
    const res=await fetch('/api/status',{cache:'no-store',signal:AbortSignal.timeout(3500)});
    if(res.ok && res.headers.get('content-type')?.includes('application/json')){
      const data=await res.json();for(const key of Object.keys(availability)) availability[key]=data[key]===true;
    }
  } catch { /* A edição estática oferece os exemplos no próprio navegador. */ }
})();
const history=[];
let lastRoute='', revision=0;
const tile=(symbol,color)=>'<span class="tile-icon '+color+'">'+icon(symbol)+'</span>';
const art='<div class="art" aria-hidden="true"><div class="paper-stack"><div class="sheet back"></div><div class="sheet"><div class="paper-top"><span class="paper-mark">≋</span><b class="paper-fold"></b></div><b class="ink-line"></b><b class="ink-line short"></b><div class="mini-chart"><b></b><b></b><b></b><b></b><b></b></div><b class="ink-line"></b></div><div class="art-token">'+icon('receipt')+'</div></div></div>';
function home(){
  host.innerHTML='<div class="home-head"><h1>Visão geral</h1><p class="sub">Simule tributos e prepare documentos fiscais em um só lugar.</p></div><section class="hero"><div class="hero-copy"><div class="hero-type">'+iconWrap('layers')+'Simulação guiada</div><h2>Quanto pesa o imposto na sua operação?</h2><p>Escolha o regime e veja como cada tributo entra na conta.</p><div class="hero-actions"><button class="btn mint" id="start">'+icon('plus')+'Iniciar simulação</button><a class="hero-link" href="#regular/exemplo">Ver um exemplo</a></div></div>'+art+'</section><section class="dash-section"><div class="section-heading"><h2>Ferramentas fiscais</h2></div><div class="card-grid">'+Object.entries(tools).map(([key,t])=>'<a href="#'+key+'" class="tool-card">'+tile(t.icon,t.theme)+'<h3>'+t.name+'</h3><p>'+t.desc+'</p><span class="tool-action">'+t.action+' '+icon('chev')+'</span></a>').join('')+'</div></section><section class="dash-section"><div class="section-heading"><h2>Exemplos para explorar</h2></div><div class="sample-list">'+sample('regular','grad','forest','Serviço de educação','Regime regular','Base de R$ 1.200,00')+sample('simples','cart','blue','Operação no mercado interno','Simples Nacional','Base de R$ 950,00')+'</div></section>';
  host.querySelector('#start').onclick=()=>modal.showModal();
}
function iconWrap(key){return '<i data-icon="'+key+'">'+icon(key)+'</i>'}
function sample(key,symbol,color,title,type,summary){return '<a class="sample-row" href="#'+key+'/exemplo">'+tile(symbol,color)+'<span class="sample-label"><b>'+title+'</b><small>'+type+'</small></span><span class="tail"><span>'+summary+'</span>'+icon('chev')+'</span></a>'}
function historyView(){
  host.innerHTML='<div class="home-head"><h1>Histórico da sessão</h1><p class="sub">Consulte as operações concluídas nesta aba. O histórico é apagado quando você recarrega a página.</p></div>';
  if(!history.length){host.insertAdjacentHTML('beforeend','<div class="empty panel">'+tile('history','forest')+'<h2>Nenhuma operação por aqui ainda</h2><p class="muted">Suas simulações e gerações de PDF aparecem aqui depois de concluídas.</p><a href="#regular/exemplo" class="btn primary">Experimentar com um exemplo</a></div>');return}
  const box=document.createElement('div');box.className='panel';
  const head=document.createElement('div');head.className='section-heading';
  const count=document.createElement('h2');count.textContent=history.length+' '+(history.length===1?'operação':'operações');
  const clear=document.createElement('button');clear.className='btn secondary';clear.textContent='Limpar histórico';clear.onclick=()=>{history.length=0;historyView()};head.append(count,clear);box.append(head);
  for(const row of history){const t=tools[row.kind];if(!t)continue;let line=document.createElement('div');line.className='history-row';line.innerHTML=tile(t.icon,t.theme);let detail=document.createElement('div'),title=document.createElement('strong'),small=document.createElement('small'),amount=document.createElement('strong');title.textContent=row.title;small.textContent=row.time+' · '+row.detail;amount.textContent=row.value;detail.append(title,small);line.append(detail,amount);box.append(line)}
  host.append(box);
}
function help(){
  const regularURL='https://github.com/ReceitaFederal/calculadora-rtc-regime-regular';
  const entries=[
    ['Qual ferramenta eu escolho?','Use o regime informado pela contabilidade da empresa. O regime regular calcula tributos sobre uma operação. O Simples Nacional mostra CBS, IBS e eventual Imposto Seletivo daquela operação. Para ver uma nota de serviço nacional já emitida, escolha PDF da NFS-e.'],
    ['O resultado do Simples é o valor do DAS?','O DAS reúne a apuração mensal da empresa. O Mesa Fiscal olha uma operação de cada vez. O valor mostrado serve para entender aquela venda ou serviço.'],
    ['O que significam CBS e IBS?','A CBS é a Contribuição sobre Bens e Serviços, federal. O IBS é o Imposto sobre Bens e Serviços, de estados e municípios. O resultado apresenta cada tributo separadamente.'],
    ['De onde vêm os valores?','Os exemplos educativos partem de casos publicados pela Receita. Você pode alterar a base e as alíquotas nos limites descritos na tela. Na instalação com os motores oficiais ligados, os dados são processados pelas calculadoras locais da Receita.'],
    ['Meu XML e minhas simulações ficam salvos?','A aplicação mantém apenas um resumo nesta aba enquanto ela está aberta. O gerador de PDF roda no navegador quando disponível. Se você usar o serviço local, o arquivo será processado por essa instalação. Um arquivo baixado fica na pasta de downloads que você escolher.']
  ];
  host.innerHTML='<div class="home-head"><h1>Central de ajuda</h1><p class="sub">Respostas rápidas para usar as ferramentas do Mesa Fiscal.</p></div><div class="section-stack"><section class="panel help-group"><h2>Dúvidas frequentes</h2>'+entries.map(([q,a])=>'<details><summary>'+q+'</summary><p>'+a+'</p></details>').join('')+'</section><section class="panel"><h2>Fontes e instalação</h2><p>O Mesa Fiscal é um projeto independente. As três ferramentas de origem são mantidas pela Receita Federal.</p><ul class="source-list"><li><a href="'+regularURL+'">Calculadora do regime regular</a></li><li><a href="https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional">Calculadora do Simples Nacional</a></li><li><a href="https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse">Gerador de DANFSe</a></li><li><a href="https://github.com/ofelipepeixoto/mesa-fiscal#usar-os-motores-da-receita">Como conectar os motores na instalação local</a></li></ul></section></div>';
}
function navigate(kind,mode='new'){if(!Object.hasOwn(titles,kind))return;const target='#'+kind+(mode==='example'?'/exemplo':'');if(location.hash===target) void route();else location.hash=target}
function closeMenu(){document.querySelector('.sidebar').classList.remove('open');document.querySelector('#scrim').hidden=true;document.querySelector('#menu').setAttribute('aria-expanded','false')}
function onComplete({kind,title,value,detail}){if(!Object.hasOwn(tools,kind))return;history.unshift({kind,title:String(title),value:String(value),detail:String(detail||''),time:new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date())});if(history.length>60)history.pop()}
async function route(){
  const id=++revision;
  const [hash,mode]=location.hash.slice(1).split('/');if(hash==='conteudo'){document.querySelector('main').focus();return}
  const key=Object.hasOwn(titles,hash)?hash:'inicio';closeMenu();if(modal.open)modal.close();
  document.querySelector('#crumb').textContent=titles[key];document.title=titles[key]+' | Mesa Fiscal';
  for(const a of document.querySelectorAll('[data-route]')){if(a.dataset.route===key)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')}
  if(key==='inicio') home();else if(key==='historico')historyView();else if(key==='ajuda')help();else{
    host.replaceChildren();await statusReady;if(id!==revision)return;
    renderFlow(key,host,{onComplete,navigate,apiAvailable:availability,initialMode:mode==='exemplo'?'example':'new'});
  }
  if(lastRoute){document.querySelector('main').focus({preventScroll:true});window.scrollTo(0,0)}
  lastRoute=key;
}
fillIcons();
document.querySelector('#today').textContent=new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'short',year:'numeric',timeZone:'America/Sao_Paulo'}).format(new Date());
document.querySelector('#choices').innerHTML=['regular','simples'].map(key=>'<button class="choice" data-choose="'+key+'">'+tile(tools[key].icon,tools[key].theme)+'<span><b>'+tools[key].name+'</b><small>'+tools[key].desc+'</small></span></button>').join('');
modal.addEventListener('click',e=>{const choice=e.target.closest('[data-choose]');if(choice){modal.close();navigate(choice.dataset.choose)}else if(e.target===modal||e.target.closest('[data-close]'))modal.close()});
document.querySelector('#menu').onclick=()=>{document.querySelector('.sidebar').classList.add('open');document.querySelector('#scrim').hidden=false;document.querySelector('#menu').setAttribute('aria-expanded','true');document.querySelector('.sidebar [aria-current="page"]')?.focus()};
document.querySelector('#scrim').onclick=()=>{closeMenu();document.querySelector('#menu').focus()};
document.querySelector('.sidebar').addEventListener('click',event=>{if(event.target.closest('a'))closeMenu()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.querySelector('#scrim').hidden){closeMenu();document.querySelector('#menu').focus()}});
window.addEventListener('hashchange',()=>void route());void route();
