const fs=require('node:fs'),path=require('node:path');
const Library=require('../library-models');
function read(directory){
  if(!fs.existsSync(directory))return {models:[],warnings:[]};
  const models=[],warnings=[];
  for(const name of fs.readdirSync(directory).filter(n=>n.endsWith('.json')).sort()){
    try{const file=path.join(directory,name);if(fs.statSync(file).size>8000000)throw Error('Too large');models.push(Library.validate(JSON.parse(fs.readFileSync(file,'utf8'))));}
    catch(error){warnings.push(name+': '+error.message);}
  }
  return {models:Library.normalize(models),warnings};
}
function add(directory,model){
  Library.validate(model);const bytes=JSON.stringify(model,null,2)+'\n';
  if(Buffer.byteLength(bytes)>8000000)throw Error('El modelo supera 8 MB.');
  fs.mkdirSync(directory,{recursive:true});
  const destination=path.join(directory,model.num+'.json');
  const temporary=destination+'.'+process.pid+'.tmp';
  try{fs.writeFileSync(temporary,bytes,{flag:'wx'});fs.linkSync(temporary,destination);}
  finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}
function replace(directory,model){
  Library.validate(model);const bytes=JSON.stringify(model,null,2)+'\n';
  if(Buffer.byteLength(bytes)>8000000)throw Error('El modelo supera 8 MB.');
  fs.mkdirSync(directory,{recursive:true});
  const destination=path.join(directory,model.num+'.json');
  const temporary=destination+'.'+process.pid+'.'+Date.now()+'.tmp';
  try{fs.writeFileSync(temporary,bytes,{flag:'wx'});fs.renameSync(temporary,destination);}
  finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}
module.exports={read,add,replace};
