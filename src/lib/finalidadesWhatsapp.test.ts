import { describe, expect, it } from 'vitest'
import { dividirEnvios, type ContaEnvios, type EvidenciaEnvio } from './finalidadesWhatsapp'

const conta = (dia: string, enviados: number | null, completa = true, marca = 'A', id = '1'): ContaEnvios =>
  ({ dia, enviados, entrega_completa: completa, marca, conta: id })
const modelo = (dia: string, enviados: number, tipo: 'rotina' | 'evento', marca = 'A', id = '1'): EvidenciaEnvio =>
  ({ dia, enviados, tipo, marca, conta: id })
const d1 = '2026-11-01', d2 = '2026-11-02', d3 = '2026-11-03'

describe('Envios por finalidade', () => {
  it('divide o total fixo e conserva saldo desconhecido, inclusive na borda UTC', () => {
    const c = [conta(d1,10), conta(d2,12), conta(d3,7), conta(d2,19,true,'B','2')]
    const ev = [modelo(d1,12,'evento'),modelo(d2,10,'rotina'),modelo(d3,6,'evento')]
    expect(dividirEnvios(c,ev,d1,d3,'A')).toEqual([{marca:'A', total:29, rotina:10, evento:6, pendente:13}])
    expect(dividirEnvios(c,ev,d2,d2,'A')).toEqual([{marca:'A', total:12, rotina:0, evento:0, pendente:12}])
  })
  it('preserva contas sem cobertura como nulas e não atribui janelas incompletas', () => {
    const c = [conta(d1,null,false),conta(d2,9,false),conta(d3,7),conta(d1,null,false,'B','2')]
    expect(dividirEnvios(c,[modelo(d3,7,'rotina')],d1,d3)).toEqual([
      {marca:'A',total:16,rotina:0,evento:0,pendente:16},
      {marca:'B',total:null,rotina:null,evento:null,pendente:null},
    ])
  })
  it('retém o bloco inteiro quando janelas adjacentes disputam os mesmos envios', () => {
    const c=[conta(d1,1),conta(d2,6),conta(d3,1),conta('2026-11-04',100)]
    const ev=[modelo(d2,6,'evento'),modelo(d3,6,'rotina')]
    expect(dividirEnvios(c,ev,d1,'2026-11-04')[0]).toEqual({marca:'A',total:108,rotina:0,evento:0,pendente:108})
  })
  it('não empresta volume de outra conta da mesma marca',()=>{
    const c=[conta(d1,1),conta(d2,2),conta(d1,8,true,'A','2'),conta(d2,10,true,'A','2')]
    expect(dividirEnvios(c,[modelo(d2,6,'rotina')],d1,d2)[0].pendente).toBe(21)
  })
  it('rejeita duplicações no denominador e na evidência', () => {
    const c=[conta(d1,5),conta(d2,4)],ev=modelo(d2,3,'rotina')
    expect(()=>dividirEnvios([...c,c[0]],[],d1,d2)).toThrow()
    expect(()=>dividirEnvios(c,[ev,ev],d1,d2)).toThrow()
  })
})
