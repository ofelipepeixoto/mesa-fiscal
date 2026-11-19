import {createMesaServer} from './app.mjs';
const port=Number(process.env.PORT||4173);
const address=process.env.CONTAINER==='1'?'0.0.0.0':'127.0.0.1';
const server=createMesaServer();
server.listen(port,address,()=>console.log('Mesa Fiscal disponível em http://localhost:'+port));
for(const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>server.close());
