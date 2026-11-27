"""Confere a V0074 nos catálogos oficiais da pilha local de homologação."""
import sqlite3
import subprocess
import tempfile
from pathlib import Path


def conferir(path):
    with sqlite3.connect(path.as_uri() + '?mode=ro', uri=True) as db:
        assert db.execute(
            "SELECT COUNT(*) FROM VERSAO_BASE_DADO WHERE VRBD_VERSAO_BASE_DADO='V0074'"
        ).fetchone()[0] == 1, 'Registro V0074 ausente ou duplicado.'
        snapshots = []
        for table, prefix in [('CLASSIF_NBS_INDOP_LC', 'CNIL'),
                              ('INDICADOR_OPERACAO_IBS_CBS', 'IOIC')]:
            db.row_factory = sqlite3.Row
            rows = [dict(row) for row in db.execute('SELECT * FROM ' + table)]
            start, end, key = (prefix + suffix for suffix in
                               ['_INICIO_VIGENCIA', '_FIM_VIGENCIA', '_ID'])
            assert rows and len({r[key] for r in rows}) == len(rows)
            assert not any(r[start] == '2026-12-01' or r[end] == '2026-11-30'
                           for r in rows), table + ': vigências antigas ainda presentes.'
            retiring = {r[key] for r in rows if r[end] == '2026-12-06'}
            entering = {r[key] for r in rows if r[start] == '2026-12-07'}
            assert retiring and entering, table + ': transição não encontrada.'
            assert retiring.isdisjoint(entering)
            for date in ['2026-11-30', '2026-12-01', '2026-12-06', '2026-12-07']:
                active = {r[key] for r in rows if r[start] <= date
                          and (r[end] is None or r[end] >= date)}
                if date < '2026-12-07':
                    assert retiring <= active and entering.isdisjoint(active), (table, date)
                else:
                    assert entering <= active and retiring.isdisjoint(active), (table, date)
            snapshots.append(sorted((tuple(sorted(r.items())) for r in rows), key=repr))
            print(f'{path.stem}: {table}, {len(retiring)} registros até 06/12 '
                  f'e {len(entering)} a partir de 07/12; quatro datas conferidas.')
        return snapshots


with tempfile.TemporaryDirectory(prefix='mesa-catalogo-') as folder:
    results = []
    for service in ['regular', 'simples']:
        target = Path(folder) / (service + '.db')
        subprocess.run(['docker', 'compose', 'cp',
                        service + ':/app/calculadora/db/calculadora-pro.db', str(target)],
                       check=True, capture_output=True, text=True, timeout=30)
        results.append(conferir(target))
    assert results[0] == results[1], 'Os dois motores precisam usar o mesmo catálogo.'
    print('V0074 confirmada nos dois catálogos, sem lacuna ou troca antecipada nos registros afetados.')
