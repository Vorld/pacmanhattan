import asyncio
from playwright.async_api import async_playwright
OUT='/tmp/claude-0/shots/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width':1280,'height':800})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(1500)
        await pg.click('#btn-start'); await pg.wait_for_timeout(300)
        # teleport next to a landmark (Grand Central) and step
        r = await pg.evaluate("""() => { const d=PM.debug, s=d.state; const l=d.LANDMARKS.find(x=>x.name==='Grand Central Terminal');
            s.ghost.e=l.pos.e; s.ghost.s=l.pos.s; s.ghost.moving=true; s.ghost.dir=1; s.ghost.started=true; s.chomper.spawnFx=5; return s.task.name }""")
        await pg.wait_for_timeout(600)
        await pg.screenshot(path=OUT+'5_landmark.png')
        r2 = await pg.evaluate("() => ({score:PM.debug.state.score, hints:PM.debug.state.hintLog})")
        print('target', r, r2)
        # teleport to target
        await pg.evaluate("""() => { const s=PM.debug.state, t=s.task; s.ghost.e=t.pos.e; s.ghost.s=t.pos.s; s.chomper.spawnFx=5; }""")
        await pg.wait_for_timeout(600)
        r3 = await pg.evaluate("() => ({score:PM.debug.state.score, tasks:PM.debug.state.tasksDone, next:PM.debug.state.task.name})")
        print(r3)
        await pg.screenshot(path=OUT+'6_found.png')
        # stand still and let chomper catch
        await pg.evaluate("() => { const s=PM.debug.state; s.chomper.spawnFx=0; s.ghost.moving=false; s.ghost.node=s.ghost.e.a; s.ghost.s=0; }")
        for i in range(60):
            await pg.wait_for_timeout(1000)
            m = await pg.evaluate("() => [PM.debug.state.mode, Math.round(PM.debug.state.danger)]")
            if m[0]=='over': break
        print('after', i, 's', m)
        await pg.wait_for_timeout(500)
        await pg.fill('#initials','tyl'); await pg.click('#btn-save'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=OUT+'7_over.png')
        print('errors', errs)
        await b.close()
asyncio.run(main())
