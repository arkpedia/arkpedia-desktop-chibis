const {test}=require('node:test'),assert=require('node:assert/strict');
const {releaseNotes}=require('../scripts/release-notes.cjs');
test('release descriptions retain credits, six platform quicklinks and checksums',()=>{
  const text=releaseNotes('v0.6.1');assert.match(text,/Unofficial, noncommercial/);
  assert.equal((text.match(/\]\(https:\/\/github.com\/arkpedia\/arkpedia-desktop-chibis\/releases\/latest\/download\/Arkpedia-/g)??[]).length,6);
  assert.match(text,/SHA256SUMS.txt/);assert.match(text,/Restored chibis are counted correctly/);
  assert.throws(()=>releaseNotes('../secret'),/version tag/);
});
