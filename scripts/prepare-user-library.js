const fs=require('node:fs'),path=require('node:path'),store=require('../desktop/library-store');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'assets/user-models');
function prepare(importLocal=false){
  fs.mkdirSync(directory,{recursive:true});
  if(importLocal&&process.env.APPDATA){
    const source=store.read(path.join(process.env.APPDATA,'es.troquelesvicente.estudio/library'));
    if(source.warnings.length)throw Error(source.warnings.join('\n'));
    for(const model of source.models){
      const existing=path.join(directory,model.num+'.json');
      if(fs.existsSync(existing)){
        if(JSON.stringify(JSON.parse(fs.readFileSync(existing,'utf8')))!==JSON.stringify(model))throw Error('Conflicto de modelo: '+model.num);
      }else store.add(directory,model);
    }
  }
  const result=store.read(directory);
  if(result.warnings.length)throw Error(result.warnings.join('\n'));
  const source='// Generated from assets/user-models/*.json by scripts/prepare-user-library.js\nwindow.BUNDLED_USER_MODELS='+JSON.stringify(result.models)+';\n';
  fs.writeFileSync(path.join(root,'assets/user-models.js'),source);
  return result.models.length;
}
module.exports=prepare;
if(require.main===module)console.log('Modelos versionados: '+prepare(process.argv.includes('--import-local')));
