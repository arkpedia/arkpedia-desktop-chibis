import type { ChibiModel } from './chibi';
export type Entry = { id:string; name:string; model:ChibiModel; kind?:'operator'|'outfit'|'enemy'|'illustration'; brand?:string };
export type LibraryState = { entries:Entry[]; downloaded:string[]; bytes:number; busy:boolean; completed:number; total:number; error?:string };
export const assetUrl = (url:string) => location.protocol === 'arkchibi:' && !url.startsWith('arkchibi:') ? `arkchibi://app/assets/${encodeURIComponent(url)}` : url;

export function matchesEntry(row:Entry, query:string, kind:string, brand:string) {
  const category = row.kind ?? (row.id.includes('@') ? 'outfit' : 'operator');
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return (kind==='all'||category===kind) && (!brand||row.brand===brand) && words.every(word=>`${row.name} ${row.brand??''} ${row.id}`.toLocaleLowerCase().includes(word));
}
export function readCatalogueFilters(storage:Pick<Storage,'getItem'>) {
  try{const value=JSON.parse(storage.getItem('catalogue-filters')??'{}');return {kind:['all','operator','outfit','enemy','illustration'].includes(value.kind)?value.kind:'all',brand:typeof value.brand==='string'?value.brand:'',downloadedOnly:value.downloadedOnly===true};}catch{return {kind:'all',brand:'',downloadedOnly:false};}
}
