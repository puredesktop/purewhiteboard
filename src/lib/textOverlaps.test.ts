import { expect, it } from 'vitest'
import { textOverlaps } from './textOverlaps'
const a = { id:'a', type:'text', text:'Owner A', x:0, y:0, width:140, height:20 }
it('detects annotation collisions but allows labels inside shapes and edge contact', () => {
 expect(textOverlaps([a,{...a,id:'b',x:100}])).toEqual([{first:'a',second:'b'}])
 expect(textOverlaps([a,{...a,id:'b',x:140},{...a,id:'shape',type:'rectangle'}])).toEqual([])
 expect(textOverlaps([a,{...a,id:'b',isDeleted:true}])).toEqual([])
 expect(textOverlaps([a,{...a,id:'b',y:25}])).toEqual([])
})
