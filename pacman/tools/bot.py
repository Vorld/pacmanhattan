# Random-input bot: plays 90s, checks for errors and stuck states.
import asyncio, random
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1280,'height':800})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(1500)
        await pg.click('#btn-start')
        await pg.evaluate("() => { PM.debug.CFG.chomperBase = 0.3; PM.debug.CFG.chomperPerTask = 0; }")
        stuck=0; last=None; runs=0
        for i in range(180):
            k = random.choice(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'])
            await pg.keyboard.press(k); await pg.wait_for_timeout(500)
            st = await pg.evaluate("() => { const s=PM.debug.state; const p=PM.debug.graph.pointAt(s.ghost.e,s.ghost.s); return [s.mode, Math.round(p[0]), Math.round(p[1]), s.visited.size, s.score] }")
            if st[0]=='over': runs+=1; await pg.click('#btn-again'); continue
            if last and st[1:3]==last[1:3]: stuck+=1
            last=st
        print('final', st, 'stationary samples', stuck, 'deaths', runs, 'errors', errs)
        fps = await pg.evaluate("""() => new Promise(r=>{let n=0;const t0=performance.now();function f(){n++; if(performance.now()-t0<2000) requestAnimationFrame(f); else r(n/2);} requestAnimationFrame(f);})""")
        print('fps', fps)
        await pg.screenshot(path='/tmp/claude-0/shots/8_bot.png')
        await b.close()
asyncio.run(main())
