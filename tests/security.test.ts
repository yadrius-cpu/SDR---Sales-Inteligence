import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword,verifyPassword,hashToken,canAdmin,canWrite,normalizeDomain } from "../src/lib/security";
test("senha é salgada e valida apenas o valor correto",()=>{const first=hashPassword("senha-longa-de-teste");assert.notEqual(first,hashPassword("senha-longa-de-teste"));assert.equal(verifyPassword("senha-longa-de-teste",first),true);assert.equal(verifyPassword("incorreta",first),false);assert.equal(verifyPassword("x","inválido"),false);});
test("perfis impedem operador no admin e viewer em escrita",()=>{assert.equal(canAdmin("owner"),true);assert.equal(canAdmin("operator"),false);assert.equal(canAdmin("viewer"),false);assert.equal(canWrite("operator"),true);assert.equal(canWrite("viewer"),false);});
test("domínios opcionais normalizam sem colapsar subdomínios",()=>{assert.equal(normalizeDomain(""),null);assert.equal(normalizeDomain("https://WWW.Example.com/path"),"example.com");assert.equal(normalizeDomain("filial.example.com"),"filial.example.com");assert.throws(()=>normalizeDomain("javascript:alert(1)"));assert.throws(()=>normalizeDomain("https://user:pass@example.com"));});
test("token não é persistido em texto claro",()=>{assert.equal(hashToken("session").length,64);assert.notEqual(hashToken("session"),hashToken("different"));});
