import asyncio, sys
from playwright.async_api import async_playwright
OUT='/tmp/claude-0/shots/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width':1280,'height':800})
        errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: m.type=='error' and errs.append(m.text))
        await pg.goto('http://localhost:8765/index.html')
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path=OUT+'1_title.png')
        await pg.click('#btn-start')
        await pg.wait_for_timeout(800)
        await pg.screenshot(path=OUT+'2_start.png')
        await pg.keyboard.down('ArrowUp'); await pg.wait_for_timeout(2500); await pg.keyboard.up('ArrowUp')
        await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(2500)
        await pg.screenshot(path=OUT+'3_moving.png')
        info = await pg.evaluate("""() => { const s=PM.debug.state; return {mode:s.mode, task:s.task.name, score:s.score, danger:Math.round(s.danger), street:document.getElementById('street').textContent, moving:s.ghost.moving} }""")
        print(info)
        # fps measure
        fps = await pg.evaluate("""() => new Promise(r=>{let n=0;const t0=performance.now();function f(){n++; if(performance.now()-t0<2000) requestAnimationFrame(f); else r(n/2);} requestAnimationFrame(f);})""")
        print('fps', fps)
        await pg.wait_for_timeout(15000)
        info = await pg.evaluate("() => { const s=PM.debug.state; return {mode:s.mode, score:s.score, danger:Math.round(s.danger||0)} }")
        print(info)
        await pg.screenshot(path=OUT+'4_later.png')
        print('errors', errs[:5])
        await b.close()
asyncio.run(main())
