export function recordReferences(result,row){
  if(result?.truncated)return [];
  return (result?.recordTargets||[]).filter(target=>target.keyComplete&&target.keys.length
    &&target.keys.every(key=>Object.hasOwn(row,key.field)&&row[key.field]!=null))
    .map(target=>({target,keys:Object.fromEntries(target.keys.map(key=>[key.column,String(row[key.field])]))}));
}
export function applyRecordChange(result,change){
  if(change.mode==='create'){result.snapshotNotice=true;return false;}
  let changed=false;
  result.rows=result.rows.flatMap(row=>{
    const reference=recordReferences(result,row).find(reference=>reference.target.schema===change.target.schema&&reference.target.table===change.target.table
      &&Object.keys(change.keys).every(key=>reference.keys[key]===String(change.keys[key])));
    if(!reference)return [row];changed=true;if(change.mode==='delete')return [];
    const updated={...row};for(const field of reference.target.fields)if(Object.hasOwn(change.saved.row,field.column))updated[field.field]=change.saved.row[field.column];return [updated];
  });
  if(changed)result.rowCount=result.rows.length;
  result.snapshotNotice=true;return changed;
}
