import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCnpj,mappedRows } from "../src/lib/crm/contracts";
import { parseCsv } from "../src/lib/crm/csv";
test("CNPJ numérico e vetor alfanumérico oficial validam sem consulta externa",()=>{
  assert.equal(normalizeCnpj("11.222.333/0001-81"),"11222333000181");assert.equal(normalizeCnpj("12.abc.345/01de-35"),"12ABC34501DE35");assert.equal(normalizeCnpj(""),null);
  for(const s of ["00000000000000","12ABC34501DE36","11222333000182","12ABC34501DE3A","1.222.333/0001-81","12ÁBC34501DE35"])assert.throws(()=>normalizeCnpj(s));
});
test("CSV preserva UTF-8, separadores, aspas e quebras internas",()=>{
  const p=parseCsv('\uFEFFnome;setor;extra\r\n"Empresa; Um";Contabilidade;"Disse ""olá""\nsegunda linha"\r\nOutra;Serviços;ok');assert.equal(p.delimiter,";");assert.equal(p.rows.length,2);assert.equal(p.rows[0].cells[0],"Empresa; Um");assert.equal(p.rows[0].cells[2],'Disse "olá"\nsegunda linha');assert.equal(p.rows[1].line,4);
  assert.equal(parseCsv('nome,setor\n"Empresa, Um",Contabilidade').rows[0].cells[0],"Empresa, Um");
});
test("CSV rejeita aspas inválidas, cabeçalhos duplicados e arquivos excessivos",()=>{
  for(const s of ['nome,nome\na,b','nome,setor\n"ab,c','nome,setor\n"ab"x,c','nome,setor\na"b,c','nome,setor\na,\0',"a".repeat(120001),'nome,setor\n'+Array.from({length:201},()=>"Empresa,Contabilidade").join("\n")])assert.throws(()=>parseCsv(s));
});
test("mapeamento mostra erros por linha e mantém zeros/letras do CNPJ",()=>{
  const rows=mappedRows("nome,segmento,documento\nFictícia,Contabilidade,12ABC34501DE35\nInválida,Contabilidade,123\nFaltando,Contabilidade",{displayName:0,sector:1,cnpj:2});assert.equal(rows[0].data?.cnpj,"12ABC34501DE35");assert.equal(rows[1].data,null);assert.equal(rows[2].data,null);
  assert.throws(()=>mappedRows("nome,setor\na,b",{displayName:0,sector:0}));assert.throws(()=>mappedRows("nome,setor\na,b",{displayName:0}));
});
