import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, Brain, Check, Clock, Lock, RotateCcw, Sparkles, Trophy, Wifi, Zap } from "lucide-react";
import { STAGES, TURN_SECONDS, type Stage } from "@/game/stages";
import { endgameTitle, scoreRound, validatorAnalyze, type RoundResult } from "@/game/validator";
import {
  playCountdownBeep,
  playLockIn,
  playRevealWhoosh,
  playCardChime,
  playResultFanfare,
} from "@/game/sounds";
import logo from "@/assets/logo.jpg";
import { STAGE_IMAGES } from "@/assets/stages";

export const Route = createFileRoute("/play")({
  component: PlayPage,
});

type Phase = "playing" | "revealing" | "result" | "endgame";

function PlayPage() {
  const navigate = useNavigate();
  const [stageIdx, setStageIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("playing");
  const [secondsLeft, setSecondsLeft] = useState(TURN_SECONDS);
  const [playerPicks, setPlayerPicks] = useState<string[]>([]);
  const [locked, setLocked] = useState(false);
  const [validatorPicks, setValidatorPicks] = useState<[string, string] | null>(null);
  const [validatorFetchMs, setValidatorFetchMs] = useState<number | null>(null);
  const [validatorSource, setValidatorSource] = useState<"onchain" | "local-consensus" | null>(null);
  const [playerScore, setPlayerScore] = useState(0);
  const [validatorScore, setValidatorScore] = useState(0);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const [revealFlash, setRevealFlash] = useState(false);
  const tickRef = useRef<number | null>(null);
  const prevPhaseRef = useRef<Phase>("playing");

  const stage = STAGES[stageIdx];
  const total = STAGES.length;

  function resetStage() {
    setPhase("playing");
    setSecondsLeft(TURN_SECONDS);
    setPlayerPicks([]);
    setLocked(false);
    setValidatorPicks(null);
    setValidatorFetchMs(null);
    setValidatorSource(null);
    setRoundResult(null);
    setRevealFlash(false);
    prevPhaseRef.current = "playing";
  }

  useEffect(() => {
    if (phase !== "playing") return;
    tickRef.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          window.clearInterval(tickRef.current!);
          handleLock(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, stageIdx]);

  useEffect(() => {
    if (phase !== "playing") return;
    if (secondsLeft <= 5 && secondsLeft > 0) {
      playCountdownBeep(secondsLeft);
    }
  }, [secondsLeft, phase]);

  useEffect(() => {
    prevPhaseRef.current = phase;
    if (phase === "result") {
      setRevealFlash(true);
      const t = window.setTimeout(() => setRevealFlash(false), 600);
      return () => window.clearTimeout(t);
    }
  }, [phase]);

  function togglePick(name: string) {
    if (locked || phase !== "playing") return;
    setPlayerPicks((cur) => {
      if (cur.length >= 2) return cur;
      if (cur.includes(name)) return cur.filter((c) => c !== name);
      return [...cur, name];
    });
  }

  async function handleLock(timedOut = false) {
    if (locked) return;
    setLocked(true);
    playLockIn();
    if (tickRef.current) window.clearInterval(tickRef.current);

    const t0 = performance.now();
    const v = await validatorAnalyze(stage);
    const elapsed = Math.round(performance.now() - t0);
    setValidatorPicks(v.picks);
    setValidatorFetchMs(elapsed);
    setValidatorSource(v.source);

    window.setTimeout(() => {
      setPhase("revealing");
      playRevealWhoosh();

      window.setTimeout(() => {
        const finalPicks = timedOut ? playerPicks : playerPicks;
        const r = scoreRound(finalPicks, v.picks, stage.correct);
        setPlayerScore((s) => s + r.player);
        setValidatorScore((s) => s + r.validator);
        setRoundResult(r.result);
        setPhase("result");

        stage.options.forEach((opt, i) => {
          const isCorrect = stage.correct.includes(opt.name as never);
          window.setTimeout(() => playCardChime(isCorrect, 0), i * 150 + 80);
        });

        window.setTimeout(() => playResultFanfare(r.result), stage.options.length * 150 + 480);
      }, 1900);
    }, 400);
  }

  function next() {
    if (stageIdx + 1 >= total) {
      setPhase("endgame");
      return;
    }
    setStageIdx((i) => i + 1);
    resetStage();
  }

  function restart() {
    setStageIdx(0);
    setPlayerScore(0);
    setValidatorScore(0);
    resetStage();
  }

  if (phase === "endgame") {
    return (
      <EndgameScreen
        playerScore={playerScore}
        validatorScore={validatorScore}
        total={total}
        onRestart={restart}
        onHome={() => navigate({ to: "/" })}
      />
    );
  }

  const blurred = phase === "playing" || phase === "revealing";
  const isResult = phase === "result";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <AnimatePresence>
        {revealFlash && (
          <motion.div
            key="flash"
            className="fixed inset-0 z-[200] pointer-events-none"
            style={{ background: "radial-gradient(ellipse at center, white 0%, oklch(0.88 0.12 295) 60%, transparent 100%)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.85, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, times: [0, 0.18, 1] }}
          />
        )}
      </AnimatePresence>

      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b-[3px] border-[color:var(--primary-deep)]/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <img src={logo} alt="MochiMind logo" className="h-8 w-8 rounded-lg object-cover ring-2 ring-[color:var(--primary-deep)]" />
            <span className="font-bold tracking-tight hidden sm:inline">MochiMind</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm">
            <ScorePill label="You" value={playerScore} accent="primary" />
            <div className="text-primary font-black">vs</div>
            <ScorePill label="AI" value={validatorScore} accent="accent" />
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-3">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-1.5">
            <span>Stage {String(stage.id).padStart(2, "0")} / {total}</span>
            <span>{stage.name}</span>
          </div>
          <Progress value={((stage.id - 1) / total) * 100} className="h-1" />
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 grid lg:grid-cols-[1fr_320px] gap-6">
        <section>
          <MochiArtCard stage={stage} blurred={blurred} />

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`text-[10px] uppercase tracking-[0.3em] font-extrabold shrink-0 ${phase === "playing" ? "hint-blink" : "text-primary"}`}>Hint</span>
              <p className={`text-sm italic truncate ${phase === "playing" ? "hint-blink" : "text-foreground/90"}`}>
                "{stage.hint}"
              </p>
            </div>
            <TimerChip seconds={secondsLeft} active={phase === "playing"} />
          </div>

          <div className="mt-6">
            <div className="text-xs uppercase tracking-[0.25em] text-primary font-extrabold mb-3">
              Pick the 2 dominant colors
            </div>

            <AnimatePresence mode="wait">
              {!isResult ? (
                <motion.div
                  key="active-grid"
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.18 }}
                  className="grid grid-cols-2 sm:grid-cols-4 gap-3"
                >
                  {stage.options.map((opt) => {
                    const selected = playerPicks.includes(opt.name);
                    return (
                      <button
                        key={opt.name}
                        onClick={() => togglePick(opt.name)}
                        disabled={locked}
                        className={`group relative rounded-2xl p-4 border-[3px] transition-all duration-200 text-left bg-card
                          ${selected ? "border-[color:var(--primary-deep)] shadow-chunky -translate-y-0.5" : "border-[color:var(--primary-deep)]/40 shadow-chunky-sm hover:-translate-y-0.5 hover:border-[color:var(--primary-deep)]"}
                          ${locked ? "cursor-not-allowed opacity-90" : ""}`}
                      >
                        <div
                          className="h-16 sm:h-20 w-full rounded-xl mb-3 ring-2 ring-[color:var(--primary-deep)]/30"
                          style={{ background: opt.hex }}
                        />
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-extrabold">{opt.name}</span>
                          {selected && (
                            <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground grid place-items-center border-2 border-[color:var(--primary-deep)]">
                              <Check className="size-3" strokeWidth={3} />
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </motion.div>
              ) : (
                <motion.div
                  key="reveal-grid"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="grid grid-cols-2 sm:grid-cols-4 gap-3"
                >
                  {stage.options.map((opt, i) => {
                    const isCorrect = stage.correct.includes(opt.name as never);
                    const wasSelected = playerPicks.includes(opt.name);
                    return (
                      <motion.div
                        key={opt.name}
                        initial={{ opacity: 0, rotateY: -90, scale: 0.8 }}
                        animate={{ opacity: 1, rotateY: 0, scale: 1 }}
                        transition={{
                          delay: i * 0.15,
                          type: "spring",
                          stiffness: 200,
                          damping: 18,
                        }}
                        style={{ transformPerspective: 1200 }}
                        className={`relative rounded-2xl p-4 border-[3px] text-left
                          ${isCorrect
                            ? "border-[color:var(--primary-deep)] shadow-chunky bg-primary/8"
                            : "border-[color:var(--primary-deep)]/30 bg-card shadow-chunky-sm opacity-75"}
                          ${wasSelected && !isCorrect ? "border-destructive/50" : ""}`}
                      >
                        {isCorrect && (
                          <motion.div
                            className="absolute inset-0 rounded-2xl pointer-events-none"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: [0, 1, 0.6] }}
                            transition={{ delay: i * 0.15 + 0.3, duration: 0.5 }}
                            style={{ boxShadow: `0 0 24px 4px ${opt.hex}88` }}
                          />
                        )}
                        <div
                          className={`h-16 sm:h-20 w-full rounded-xl mb-3 ring-2 ${isCorrect ? "ring-[color:var(--primary-deep)]" : "ring-[color:var(--primary-deep)]/20"}`}
                          style={{ background: opt.hex }}
                        />
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-extrabold">{opt.name}</span>
                          {isCorrect && (
                            <span className="text-[10px] uppercase tracking-widest text-primary font-extrabold">Correct</span>
                          )}
                        </div>
                        {isCorrect && <CardParticles hex={opt.hex} cardIndex={i} />}
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              {!isResult && (
                locked ? (
                  <Button variant="hero" size="lg" className="rounded-full opacity-60 cursor-not-allowed" disabled>
                    <Lock className="size-4" /> Locked
                  </Button>
                ) : (
                  <Button
                    variant="hero"
                    size="lg"
                    className="rounded-full"
                    disabled={playerPicks.length !== 2}
                    onClick={() => handleLock(false)}
                  >
                    <Lock className="size-4" /> Lock In
                  </Button>
                )
              )}
              {isResult && (
                <Button variant="hero" size="lg" className="rounded-full" onClick={next}>
                  {stageIdx + 1 >= total ? "See Final" : "Next Stage"} <ArrowRight className="size-4" />
                </Button>
              )}
              <span className="text-xs text-muted-foreground">
                {playerPicks.length}/2 selected
              </span>
            </div>
          </div>
        </section>

        <aside>
          <ValidatorPanel
            phase={phase}
            picks={validatorPicks}
            correct={stage.correct}
            result={roundResult}
            playerPicks={playerPicks}
            fetchMs={validatorFetchMs}
            source={validatorSource}
          />
        </aside>
      </div>
    </main>
  );
}

function CardParticles({ hex, cardIndex }: { hex: string; cardIndex: number }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const angle = (i / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const dist = 38 + Math.random() * 55;
        return {
          tx: Math.round(Math.cos(angle) * dist),
          ty: Math.round(Math.sin(angle) * dist),
          delay: cardIndex * 150 + i * 28 + Math.floor(Math.random() * 25),
          size: 6 + Math.floor(Math.random() * 6),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cardIndex],
  );

  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible" aria-hidden>
      {particles.map((p, i) => (
        <div
          key={i}
          className="mochi-particle absolute top-1/2 left-1/2 rounded-full"
          style={
            {
              "--tx": `${p.tx}px`,
              "--ty": `${p.ty}px`,
              width: p.size,
              height: p.size,
              background: hex,
              opacity: 0,
              animationDelay: `${p.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

function ScorePill({ label, value, accent }: { label: string; value: number; accent: "primary" | "accent" }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border-[3px] border-[color:var(--primary-deep)] shadow-chunky-sm">
      <span className={`h-1.5 w-1.5 rounded-full ${accent === "primary" ? "bg-primary" : "bg-primary-glow"}`} />
      <span className="text-muted-foreground font-bold">{label}</span>
      <motion.span
        key={value}
        initial={{ scale: 1.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="font-black tabular-nums text-primary"
      >
        {value}
      </motion.span>
    </div>
  );
}

function TimerChip({ seconds, active }: { seconds: number; active: boolean }) {
  const danger = seconds <= 5;
  return (
    <div
      key={seconds}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border-[3px] text-xs tabular-nums font-extrabold shadow-chunky-sm bg-card
        ${danger ? "border-destructive text-destructive" : "border-[color:var(--primary-deep)] text-primary"}
        ${active ? "timer-tick" : "opacity-60"}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${danger ? "bg-destructive animate-pulse" : "bg-primary"}`} />
      {String(seconds).padStart(2, "0")}s
    </div>
  );
}

function ValidatorFetchChip({
  phase,
  fetchMs,
  source,
}: {
  phase: Phase;
  fetchMs: number | null;
  source: "onchain" | "local-consensus" | null;
}) {
  if (phase === "playing") return null;

  const isRevealing = phase === "revealing" && fetchMs === null;
  const isLocalConsensus = source === "local-consensus";

  return (
    <AnimatePresence>
      <motion.div
        key={source ?? "loading"}
        initial={{ opacity: 0, y: -6, height: 0 }}
        animate={{ opacity: 1, y: 0, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="overflow-hidden mb-4"
      >
        {isRevealing ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border-[2px] border-[color:var(--primary-deep)]/30 bg-secondary text-[11px] font-bold text-muted-foreground w-fit">
            <Clock className="size-3 animate-pulse" />
            Consulting AI Validators…
          </div>
        ) : isLocalConsensus ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border-[2px] border-violet-400/60 bg-violet-50 text-[11px] font-extrabold text-violet-700 w-fit">
            <Brain className="size-3" />
            3 AI Validators · Simulated
            {fetchMs !== null && (
              <span className="ml-1 opacity-70 font-bold">{fetchMs}ms</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border-[2px] border-emerald-400/60 bg-emerald-50 text-[11px] font-extrabold text-emerald-700 w-fit">
            <Wifi className="size-3" />
            On-chain · Bradbury
            {fetchMs !== null && (
              <span className="ml-1 opacity-70 font-bold">{fetchMs}ms</span>
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function MochiArtCard({ stage, blurred }: { stage: Stage; blurred: boolean }) {
  const stageImg = STAGE_IMAGES[stage.id];

  return (
    <div className="relative aspect-[16/10] sm:aspect-[16/9] rounded-3xl overflow-hidden border-[4px] border-[color:var(--primary-deep)] bg-secondary shadow-card-chunky">
      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: blurred ? 1 : 0 }}
        transition={{ duration: 0.6 }}
        className="absolute inset-0 bg-secondary/60"
      />
      <motion.div
        key={stage.id}
        initial={{ filter: "blur(56px) saturate(0.6)", scale: 1.04 }}
        animate={{
          filter: blurred ? "blur(56px) saturate(0.6)" : "blur(0px) saturate(1)",
          scale: blurred ? 1.04 : 1,
        }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-0 grid place-items-center"
      >
        {stageImg ? (
          <img
            src={stageImg}
            alt={`${stage.name} mascot`}
            className="h-[88%] w-auto object-contain drop-shadow-[0_30px_60px_rgba(0,0,0,0.45)]"
          />
        ) : (
          <div
            className="h-[55%] w-[42%] rounded-[50%]"
            style={{
              background: `radial-gradient(circle at 35% 35%, ${stage.options[0].hex}, ${stage.options[1].hex})`,
              boxShadow: `0 30px 80px -20px ${stage.options[0].hex}80`,
            }}
          />
        )}
      </motion.div>

      {blurred && (
        <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-accent to-transparent animate-scan z-20 shadow-glow" />
      )}

      <div className="absolute top-3 left-3 text-[10px] uppercase tracking-[0.3em] text-primary-foreground font-extrabold flex items-center gap-2 z-20 px-2.5 py-1 rounded-full bg-primary border-2 border-[color:var(--primary-deep)]">
        <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground animate-pulse" />
        Stage {String(stage.id).padStart(2, "0")}
      </div>
      <div className="absolute bottom-3 right-3 text-[10px] uppercase tracking-[0.3em] text-primary-foreground font-extrabold z-20 px-2.5 py-1 rounded-full bg-primary border-2 border-[color:var(--primary-deep)]">
        Difficulty {"●".repeat(stage.difficulty)}{"○".repeat(5 - stage.difficulty)}
      </div>
    </div>
  );
}

function ValidatorPanel({
  phase,
  picks,
  correct,
  result,
  playerPicks,
  fetchMs,
  source,
}: {
  phase: Phase;
  picks: [string, string] | null;
  correct: [string, string];
  result: RoundResult | null;
  playerPicks: string[];
  fetchMs: number | null;
  source: "onchain" | "local-consensus" | null;
}) {
  return (
    <div className="rounded-3xl bg-card border-[3px] border-[color:var(--primary-deep)] shadow-card-chunky p-5 sticky top-32">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-10 w-10 rounded-xl bg-primary border-2 border-[color:var(--primary-deep)] grid place-items-center">
          <Brain className="size-5 text-primary-foreground" strokeWidth={2.5} />
        </div>
        <div>
          <div className="text-sm font-extrabold">Validator AI</div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-primary font-bold">
            GenLayer-aligned
          </div>
        </div>
      </div>

      <ValidatorFetchChip phase={phase} fetchMs={fetchMs} source={source} />

      <AnimatePresence mode="wait">
        {phase === "playing" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-sm text-muted-foreground"
          >
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="size-4 text-accent" />
              <span>Standing by…</span>
            </div>
            <p className="text-xs leading-relaxed">
              Lock in your two picks. The Validator will reason in parallel and reveal its answer.
            </p>
          </motion.div>
        )}

        {phase === "revealing" && (
          <motion.div
            key="thinking"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-sm"
          >
            <div className="flex items-center gap-2 mb-3 text-accent">
              <Zap className="size-4 animate-pulse" />
              <span className="font-semibold">Analyzing dominance…</span>
            </div>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div className="h-full w-1/2 bg-gradient-primary animate-scan" />
            </div>
          </motion.div>
        )}

        {phase === "result" && picks && result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 text-sm"
          >
            <ResultBadge result={result} />
            <Row label="Your pick" colors={playerPicks} correct={correct} />
            <Row label="AI pick" colors={picks} correct={correct} />
            <Row label="Truth" colors={correct} correct={correct} highlight />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ResultBadge({ result }: { result: RoundResult }) {
  const map: Record<RoundResult, { label: string; className: string }> = {
    "perfect-match": { label: "Perfect Match", className: "bg-accent text-accent-foreground" },
    "player-wins": { label: "You Win", className: "bg-primary text-primary-foreground" },
    "validator-wins": { label: "AI Wins", className: "bg-destructive text-destructive-foreground" },
    "shared-misread": { label: "Shared Misread", className: "bg-secondary text-secondary-foreground" },
  };
  const m = map[result];
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 280, damping: 18 }}
      className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-extrabold border-[3px] border-[color:var(--primary-deep)] shadow-chunky-sm ${m.className}`}
    >
      <Sparkles className="size-3" /> {m.label}
    </motion.div>
  );
}

function Row({
  label,
  colors,
  correct,
  highlight = false,
}: {
  label: string;
  colors: string[];
  correct: [string, string];
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl border-[3px] border-[color:var(--primary-deep)]/40 p-3 ${highlight ? "bg-primary/10 border-[color:var(--primary-deep)]" : "bg-card"}`}>
      <div className="text-[10px] uppercase tracking-[0.25em] text-primary font-extrabold mb-2">{label}</div>
      <div className="flex flex-wrap gap-2">
        {colors.length === 0 && <span className="text-xs text-muted-foreground">— none —</span>}
        {colors.map((c) => {
          const ok = correct.includes(c as never);
          return (
            <span
              key={c}
              className={`text-xs px-2.5 py-1 rounded-lg border-2 font-bold ${ok ? "border-[color:var(--primary-deep)] bg-secondary text-primary" : "border-destructive/60 text-foreground/80"}`}
            >
              {c}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function EndgameScreen({
  playerScore,
  validatorScore,
  total,
  onRestart,
  onHome,
}: {
  playerScore: number;
  validatorScore: number;
  total: number;
  onRestart: () => void;
  onHome: () => void;
}) {
  const title = endgameTitle(playerScore, validatorScore, total);

  return (
    <main className="min-h-screen bg-background text-foreground grid place-items-center px-6 py-20">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 h-[500px] w-[500px] rounded-full bg-primary/30 blur-[160px]" />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-xl w-full text-center bg-card border-[3px] border-[color:var(--primary-deep)] rounded-3xl p-10 shadow-card-chunky"
      >
        <div className="mx-auto h-20 w-20 rounded-2xl bg-primary border-[3px] border-[color:var(--primary-deep)] grid place-items-center shadow-chunky-sm mb-6">
          <Trophy className="size-10 text-primary-foreground" strokeWidth={2.5} />
        </div>
        <div className="text-xs uppercase tracking-[0.3em] text-primary font-extrabold mb-3">Endgame</div>
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-4">
          <span className="text-gradient">{title}</span>
        </h1>
        <p className="text-foreground/90 italic mb-8">
          "My true colors were always Purple and White."
        </p>

        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="rounded-2xl border-[3px] border-[color:var(--primary-deep)] p-5 bg-secondary shadow-chunky-sm">
            <div className="text-[10px] uppercase tracking-[0.25em] text-primary font-extrabold mb-1">You</div>
            <div className="text-4xl font-black tabular-nums text-primary">{playerScore}</div>
            <div className="text-xs text-muted-foreground font-bold">of {total}</div>
          </div>
          <div className="rounded-2xl border-[3px] border-[color:var(--primary-deep)] p-5 bg-secondary shadow-chunky-sm">
            <div className="text-[10px] uppercase tracking-[0.25em] text-primary font-extrabold mb-1">Validator AI</div>
            <div className="text-4xl font-black tabular-nums text-primary">{validatorScore}</div>
            <div className="text-xs text-muted-foreground font-bold">of {total}</div>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="hero" size="lg" className="rounded-full" onClick={onRestart}>
            <RotateCcw className="size-4" /> Play Again
          </Button>
          <Button variant="glass" size="lg" className="rounded-full" onClick={onHome}>
            Home
          </Button>
        </div>
      </motion.div>
    </main>
  );
}
