'use client';
import { useState, useEffect, useRef, useCallback } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import styles from "./page.module.css";
import React from 'react';

// Types for future extensibility
interface User {
  id: string;
  name: string;
  email: string;
  image?: string;
}

type GameMode = 'offline' | 'online';

interface PlackGackGameProps {
  user?: User | null;
  persistentBalance?: number;
  persistentStats?: any;
  mode: GameMode;
  onExit: () => void;
  onSaveBalance?: (balance: number, stats?: any) => void;
  isMobile?: boolean;
}

interface LeaderboardEntry {
  id: string;
  balance: number;
  gameDate: string;
  user: {
    name: string;
    image?: string;
    username?: string;
  };
}

// Card and game logic helpers
const suits = ['♠', '♥', '♦', '♣'];
const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createDeck() {
  const deck = [];
  for (let suit of suits) {
    for (let value of values) {
      deck.push({ value, suit });
    }
  }
  // Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function getHandValue(hand: { value: string; suit: string }[]) {
  let value = 0;
  let aces = 0;
  for (let card of hand) {
    if (card.value === 'A') {
      value += 11;
      aces++;
    } else if (["K", "Q", "J"].includes(card.value)) {
      value += 10;
    } else {
      value += parseInt(card.value);
    }
  }
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  return value;
}

function handToString(hand: { value: string; suit: string }[]) {
  return hand.map(card => card.value + card.suit).join(' ');
}

function isPlackGack(hand: { value: string; suit: string }[]) {
  return hand.length === 2 && getHandValue(hand) === 21;
}

function canSplit(hand: { value: string; suit: string }[]) {
  return hand.length === 2 && hand[0].value === hand[1].value;
}

function canDoubleDown(hand: { value: string; suit: string }[]) {
  return hand.length === 2 && getHandValue(hand) >= 9 && getHandValue(hand) <= 11;
}

// ---------- Presentational card components ----------
function PlayingCard({ card, faceDown, index = 0 }: { card?: { value: string; suit: string }; faceDown?: boolean; index?: number }) {
  const style = { animationDelay: `${index * 0.08}s` } as React.CSSProperties;
  if (faceDown || !card) {
    return <div className={`${styles.card} ${styles.cardBack}`} style={style} aria-label="face down card" />;
  }
  const isRed = card.suit === '♥' || card.suit === '♦';
  return (
    <div className={`${styles.card} ${isRed ? styles.cardRed : ''}`} style={style} aria-label={`${card.value} ${card.suit}`}>
      <span className={`${styles.cardCorner} ${styles.cardCornerTop}`}>{card.value}<span>{card.suit}</span></span>
      <span className={styles.cardPip}>{card.suit}</span>
      <span className={`${styles.cardCorner} ${styles.cardCornerBottom}`}>{card.value}<span>{card.suit}</span></span>
    </div>
  );
}

function CardHand({ hand, hideSecond }: { hand: { value: string; suit: string }[]; hideSecond?: boolean }) {
  return (
    <div className={styles.hand}>
      {hand.map((card, i) => (
        <PlayingCard key={i} card={card} faceDown={hideSecond && i === 1} index={i} />
      ))}
    </div>
  );
}

function PlackGackGame({ user, persistentBalance, persistentStats, mode, onExit, onSaveBalance, isMobile }: PlackGackGameProps & { isMobile?: boolean, persistentStats?: any }) {
  // Game state
  const [deck, setDeck] = useState(createDeck());
  const [playerHands, setPlayerHands] = useState<{ value: string; suit: string }[][]>([]);
  const [dealerHand, setDealerHand] = useState<{ value: string; suit: string }[]>([]);
  const [currentHandIndex, setCurrentHandIndex] = useState(0);
  const [playerTurn, setPlayerTurn] = useState(true);
  const [message, setMessage] = useState('');
  const [balance, setBalance] = useState(mode === 'online' ? (persistentBalance || 100) : 100);
  const [currentBet, setCurrentBet] = useState(10);
  const [inRound, setInRound] = useState(false);
  const [showDealer, setShowDealer] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [gamePhase, setGamePhase] = useState<'betting' | 'playing' | 'dealer' | 'complete'>('betting');
  const [doubledDownHands, setDoubledDownHands] = useState<Set<number>>(new Set());
  const [gameOver, setGameOver] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const lastSavedBalance = useRef<number>(balance);
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState({
    totalHands: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    blackjacks: 0,
    currentWinStreak: 0,
    bestWinStreak: 0,
    currentLossStreak: 0,
    bestLossStreak: 0,
    totalBet: 0,
    mostDrawnCard: '',
    cardCounts: {} as Record<string, number>,
    fiveCardCharlies: 0,
  });

  const playerHand = playerHands[currentHandIndex] || [];

  // Fetch leaderboard data
  const fetchLeaderboard = async () => {
    try {
      const response = await fetch('/api/scores');
      if (response.ok) {
        const data = await response.json();
        setLeaderboardData(data);
      }
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    }
  };

  // Fetch leaderboard on component mount
  useEffect(() => {
    fetchLeaderboard();
  }, []);

  // Initialize stats state from persistentStats if provided
  useEffect(() => {
    if (mode === 'online' && persistentStats) {
      setStats((prev) => ({ ...prev, ...persistentStats }));
    }
    // eslint-disable-next-line
  }, [persistentStats, mode]);

  // Save balance function with debouncing
  const saveBalance = useCallback((newBalance: number) => {
    if (mode === 'online' && onSaveBalance && newBalance !== lastSavedBalance.current) {
      lastSavedBalance.current = newBalance;
      onSaveBalance(newBalance, stats);
    }
  }, [mode, onSaveBalance, stats]);

  // Save balance when game ends
  useEffect(() => {
    if (mode === 'online' && gameOver) {
      saveBalance(balance);
    }
  }, [gameOver, mode, saveBalance, balance]);

  // Save balance when exiting the game
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (mode === 'online' && onSaveBalance) {
        // Use sendBeacon for reliable saving when page is closing
        const data = JSON.stringify({ balance, ...stats });
        navigator.sendBeacon('/api/scores', data);
      }
    };

    if (mode === 'online') {
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  }, [mode, onSaveBalance, balance, stats]);

  // Helper function to check if user has enough funds for actions
  function hasEnoughFundsForAction(action: 'double' | 'split'): boolean {
    return balance >= currentBet;
  }

  // Betting functions
  function adjustBet(amount: number) {
    const newBet = Math.max(5, Math.min(balance, currentBet + amount));
    setCurrentBet(newBet);
  }

  function setBet(amount: number) {
    if (amount <= balance && amount >= 5) {
      setCurrentBet(amount);
    }
  }

  // Start a new round
  function startRound() {
    if (balance < currentBet) {
      setMessage('Not enough funds to bet. Game over!');
      setInRound(false);
      setGameOver(true);
      return;
    }

    // Check if deck needs to be reshuffled (when less than 15 cards remain)
    const newDeck = deck.length < 15 ? createDeck() : [...deck];
    const player = [newDeck.pop()!, newDeck.pop()!];
    const dealer = [newDeck.pop()!, newDeck.pop()!];

    setDeck(newDeck);
    setPlayerHands([player]);
    setDealerHand(dealer);
    setCurrentHandIndex(0);
    setPlayerTurn(true);
    setMessage('');
    setInRound(true);
    setShowDealer(false);
    setGamePhase('playing');
    setDoubledDownHands(new Set());
    setGameOver(false);
    setBalance(b => b - currentBet);

    // Check for plack gack (blackjack)
    if (isPlackGack(player)) {
      setTimeout(() => {
        endRound('plackgack', undefined, [player]);
      }, 1000);
    }
  }

  // Player actions
  function hit() {
    if (!inRound || !playerTurn || gamePhase !== 'playing') return;

    const newDeck = [...deck];
    const newHands = [...playerHands];

    // Ensure we have cards to deal
    if (newDeck.length === 0) {
      setMessage('No cards left in deck! Reshuffling...');
      const reshuffledDeck = createDeck();
      newHands[currentHandIndex] = [...newHands[currentHandIndex], reshuffledDeck.pop()!];
      setDeck(reshuffledDeck);
    } else {
      newHands[currentHandIndex] = [...newHands[currentHandIndex], newDeck.pop()!];
      setDeck(newDeck);
    }

    setPlayerHands(newHands);

    if (getHandValue(newHands[currentHandIndex]) > 21) {
      if (currentHandIndex < playerHands.length - 1) {
        // Move to next hand
        setCurrentHandIndex(currentHandIndex + 1);
      } else {
        // All hands are done
        endRound('bust');
      }
    }
  }

  function stand() {
    if (!inRound || !playerTurn || gamePhase !== 'playing') return;

    if (currentHandIndex < playerHands.length - 1) {
      // Move to next hand
      setCurrentHandIndex(currentHandIndex + 1);
    } else {
      // All hands are done, dealer's turn
      setPlayerTurn(false);
      setShowDealer(true);
      setGamePhase('dealer');

      // Dealer's turn
      let newDeck = [...deck];
      let newDealerHand = [...dealerHand];
      while (getHandValue(newDealerHand) < 17) {
        newDealerHand.push(newDeck.pop()!);
      }
      setDeck(newDeck);
      setDealerHand(newDealerHand);
      setTimeout(() => {
        endRound('stand', newDealerHand);
      }, 500);
    }
  }

  function doubleDown() {
    if (!inRound || !playerTurn || gamePhase !== 'playing' || !canDoubleDown(playerHand)) return;
    if (!hasEnoughFundsForAction('double')) {
      setMessage('Not enough funds to double down!');
      return;
    }
    // Deduct the additional bet for double down
    setBalance(b => b - currentBet);
    const newDeck = [...deck];
    if (newDeck.length === 0) {
      setMessage('No cards left in deck! Reshuffling...');
      newDeck.push(...createDeck());
    }
    const newHands = [...playerHands];
    newHands[currentHandIndex] = [...newHands[currentHandIndex], newDeck.pop()!];
    setDeck(newDeck);
    setPlayerHands(newHands);
    // Don't deduct balance again - it was already deducted in startRound()
    setDoubledDownHands(prev => new Set([...prev, currentHandIndex]));

    if (getHandValue(newHands[currentHandIndex]) > 21) {
      if (currentHandIndex < playerHands.length - 1) {
        // Move to next hand
        setCurrentHandIndex(currentHandIndex + 1);
      } else {
        // All hands are done
        endRound('bust');
      }
    } else {
      // Stand after double down
      if (currentHandIndex < playerHands.length - 1) {
        setCurrentHandIndex(currentHandIndex + 1);
      } else {
        setPlayerTurn(false);
        setShowDealer(true);
        setGamePhase('dealer');

        // Dealer's turn — continue from the deck that already has the
        // double-down card removed (not the stale `deck` state).
        const dealerDeck = [...newDeck];
        let newDealerHand = [...dealerHand];
        while (getHandValue(newDealerHand) < 17) {
          newDealerHand.push(dealerDeck.pop()!);
        }
        setDeck(dealerDeck);
        setDealerHand(newDealerHand);
        setTimeout(() => {
          endRound('stand', newDealerHand);
        }, 500);
      }
    }
  }

  function split() {
    if (!inRound || !playerTurn || gamePhase !== 'playing' || !canSplit(playerHand)) return;
    if (!hasEnoughFundsForAction('split')) {
      setMessage('Not enough funds to split!');
      return;
    }

    const newDeck = [...deck];
    if (newDeck.length < 2) {
      setMessage('No cards left in deck! Reshuffling...');
      newDeck.push(...createDeck());
    }
    const newHands = [...playerHands];
    const handToSplit = newHands[currentHandIndex];

    // Create two new hands
    newHands[currentHandIndex] = [handToSplit[0]];
    newHands.splice(currentHandIndex + 1, 0, [handToSplit[1]]);

    // Deal one card to each new hand
    newHands[currentHandIndex].push(newDeck.pop()!);
    newHands[currentHandIndex + 1].push(newDeck.pop()!);

    setDeck(newDeck);
    setPlayerHands(newHands);
    // Deduct additional bet for the split hand
    setBalance(b => b - currentBet);
    setCurrentHandIndex(currentHandIndex);
  }

  function endRound(reason: 'bust' | 'stand' | 'plackgack', finalDealerHand?: { value: string; suit: string }[], overridePlayerHands?: { value: string; suit: string }[][]) {
    setInRound(false);
    setGamePhase('complete');
    setPlayerTurn(false);
    setShowDealer(true);

    // --- Stats tracking ---
    // Use overridePlayerHands if provided, otherwise use playerHands
    const handsForStats = overridePlayerHands || playerHands;
    let blackjacksInRound = 0;
    let charliesInRound = 0;
    let cardsDrawn: string[] = [];
    let handResults: ('win' | 'loss' | 'push')[] = [];
    handsForStats.forEach((hand, idx) => {
      if (isPlackGack(hand)) blackjacksInRound++;
      if (hand.length >= 5 && getHandValue(hand) <= 21) charliesInRound++;
      hand.forEach(card => cardsDrawn.push(card.value));
      // Determine result for streaks
      const playerValue = getHandValue(hand);
      if (playerValue > 21) {
        handResults.push('loss');
      } else if ((finalDealerHand ? getHandValue(finalDealerHand) : getHandValue(dealerHand)) > 21 || playerValue > (finalDealerHand ? getHandValue(finalDealerHand) : getHandValue(dealerHand))) {
        handResults.push('win');
      } else if (playerValue < (finalDealerHand ? getHandValue(finalDealerHand) : getHandValue(dealerHand))) {
        handResults.push('loss');
      } else {
        handResults.push('push');
      }
    });
    updateStats({
      handResults,
      betAmount: currentBet * handsForStats.length, // crude but works for now
      playerHands: handsForStats,
      blackjacksInRound,
      cardsDrawn,
      charliesInRound,
    });

    const dealerValue = getHandValue(finalDealerHand || dealerHand);
    let resultMsg = '';
    let totalPayout = 0;
    if (reason === 'plackgack') {
      // Plack Gack (Blackjack) pays 3:2
      const winnings = Math.floor(currentBet * 1.5);
      const totalPayout = winnings + currentBet;
      resultMsg = `Plack Gack! You win $${winnings} + your $${currentBet} bet back = $${totalPayout}!`;
      setBalance(b => b + totalPayout);
    } else if (reason === 'bust') {
      resultMsg = 'Bust! You lose your bet.';
    } else {
      // Calculate results for each hand (use the finalized hands, not stale state)
      const handsForPayout = overridePlayerHands || playerHands;
      const results = handsForPayout.map((hand, index) => {
        const playerValue = getHandValue(hand);
        // For double down hands, the bet amount is doubled
        const betAmount = doubledDownHands.has(index) ? currentBet * 2 : currentBet;
        let handMsg = '';
        let handPayout = 0;

        if (playerValue > 21) {
          handMsg = `Hand ${index + 1}: Bust! Lost $${betAmount}`;
          handPayout = 0;
        } else if (dealerValue > 21) {
          // Dealer busts - 1:1 payout + original bet
          const winnings = betAmount;
          const totalPayout = winnings + betAmount;
          handMsg = `Hand ${index + 1}: Dealer busts! You win $${winnings} + your $${betAmount} bet back = $${totalPayout}!`;
          handPayout = totalPayout;
        } else if (playerValue > dealerValue) {
          // Player wins - 1:1 payout + original bet
          const winnings = betAmount;
          const totalPayout = winnings + betAmount;
          handMsg = `Hand ${index + 1}: You win $${winnings} + your $${betAmount} bet back = $${totalPayout}!`;
          handPayout = totalPayout;
        } else if (playerValue < dealerValue) {
          handMsg = `Hand ${index + 1}: Dealer wins. Lost $${betAmount}`;
          handPayout = 0; // No payout for loss
        } else {
          // Push - return the original bet, no winnings
          handMsg = `Hand ${index + 1}: Push! Your $${betAmount} bet returned.`;
          handPayout = betAmount; // Return original bet only
        }

        return { handPayout, handMsg };
      });

      totalPayout = results.reduce((sum, result) => sum + result.handPayout, 0);
      resultMsg = results.map(r => r.handMsg).join('\n');

      // Update balance and check game over status
      setBalance(b => {
        const newBalance = b + totalPayout;
        if (newBalance < 5) {
          setGameOver(true);
        }
        return newBalance;
      });
    }

    setMessage(resultMsg);

    // Add to history with correct balance calculation
    const dealerHandStr = handToString(finalDealerHand || dealerHand);
    const playerHandsStr = handsForStats.map(hand => handToString(hand)).join(' | ');
    setHistory(prev => [
      `Dealer: ${dealerHandStr} (${dealerValue}) | You: ${playerHandsStr} | ${resultMsg.split('\n')[0]}`,
      ...prev.slice(0, 19)
    ]);
  }

  // Save balance when a round completes
  useEffect(() => {
    if (mode === 'online' && gamePhase === 'complete' && !inRound) {
      saveBalance(balance);
    }
  }, [gamePhase, mode, saveBalance, balance, inRound]);

  // Add a function to update stats after each hand/round
  function updateStats({
    handResults,
    betAmount,
    playerHands,
    blackjacksInRound,
    cardsDrawn,
    charliesInRound,
  }: {
    handResults: ('win' | 'loss' | 'push')[],
    betAmount: number,
    playerHands: { value: string; suit: string }[][],
    blackjacksInRound: number,
    cardsDrawn: string[],
    charliesInRound: number,
  }) {
    setStats(prev => {
      // Card counts
      const cardCounts = { ...prev.cardCounts };
      for (const card of cardsDrawn) {
        cardCounts[card] = (cardCounts[card] || 0) + 1;
      }
      // Most drawn card
      let mostDrawnCard = prev.mostDrawnCard;
      let maxCount = 0;
      for (const [card, count] of Object.entries(cardCounts)) {
        if (count > maxCount) {
          mostDrawnCard = card;
          maxCount = count;
        }
      }
      // Streaks
      let currentWinStreak = prev.currentWinStreak;
      let bestWinStreak = prev.bestWinStreak;
      let currentLossStreak = prev.currentLossStreak;
      let bestLossStreak = prev.bestLossStreak;
      let wins = prev.wins;
      let losses = prev.losses;
      let pushes = prev.pushes;
      for (const result of handResults) {
        if (result === 'win') {
          wins++;
          currentWinStreak++;
          bestWinStreak = Math.max(bestWinStreak, currentWinStreak);
          currentLossStreak = 0;
        } else if (result === 'loss') {
          losses++;
          currentLossStreak++;
          bestLossStreak = Math.max(bestLossStreak, currentLossStreak);
          currentWinStreak = 0;
        } else {
          pushes++;
          currentWinStreak = 0;
          currentLossStreak = 0;
        }
      }
      return {
        ...prev,
        totalHands: prev.totalHands + handResults.length,
        wins,
        losses,
        pushes,
        blackjacks: prev.blackjacks + blackjacksInRound,
        currentWinStreak,
        bestWinStreak,
        currentLossStreak,
        bestLossStreak,
        totalBet: prev.totalBet + betAmount,
        mostDrawnCard,
        cardCounts,
        fiveCardCharlies: prev.fiveCardCharlies + charliesInRound,
      };
    });
  }

  const hasHands = inRound || playerHands.length > 0;

  return (
    <div className={styles.screen}>
      {/* Faded game history backdrop (offline) */}
      {mode === 'offline' && history.length > 0 && (
        <div className={styles.gameHistory} aria-hidden="true">
          {history.map((entry, i) => (
            <div key={i}>{entry}</div>
          ))}
        </div>
      )}

      {/* Top bar */}
      <header className={styles.topBar}>
        <div className={styles.topGroup}>
          <button className={styles.navBtn} onClick={() => {
            if (!showLeaderboard) fetchLeaderboard();
            setShowLeaderboard(s => !s);
            setShowStats(false);
          }}>
            Leaderboard
          </button>
          <button className={styles.navBtn} onClick={() => {
            setShowStats(s => !s);
            setShowLeaderboard(false);
          }}>
            Stats
          </button>
        </div>
        <span className={styles.brand}>Plack&nbsp;Gack</span>
        <div className={styles.topGroup}>
          <button className={`${styles.navBtn} ${styles.navBtnDanger}`} onClick={() => {
            saveBalance(balance);
            onExit();
          }}>
            Exit
          </button>
        </div>
      </header>

      {/* Felt / table */}
      <main className={styles.felt}>
        {hasHands ? (
          <>
            {/* Dealer */}
            <section className={styles.seat}>
              <div className={styles.seatLabel}>
                Dealer
                <span className={styles.valueBadge}>{showDealer ? getHandValue(dealerHand) : '?'}</span>
              </div>
              <CardHand hand={dealerHand} hideSecond={!showDealer} />
            </section>

            {/* Player hand(s) */}
            <div className={styles.playerHands}>
              {playerHands.map((hand, idx) => (
                <section
                  key={idx}
                  className={`${styles.seat} ${idx === currentHandIndex && inRound && playerTurn ? styles.activeSeat : ''}`}
                >
                  <div className={styles.seatLabel}>
                    {playerHands.length > 1 ? `Hand ${idx + 1}` : 'You'}
                    <span className={styles.valueBadge}>{getHandValue(hand)}</span>
                    {doubledDownHands.has(idx) && <span className={styles.tag}>2×</span>}
                  </div>
                  <CardHand hand={hand} />
                </section>
              ))}
            </div>
          </>
        ) : (
          <div className={styles.emptyTable}>
            {gameOver ? 'Out of funds — game over' : 'Place your bet · Deal to begin'}
          </div>
        )}

        {/* Message banner */}
        <div className={`${styles.banner} ${message ? styles.bannerShow : ''}`}>
          {message}
        </div>
      </main>

      {/* Control dock */}
      <div className={styles.dock}>
        {inRound ? (
          <div className={styles.actionRow}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={hit} disabled={!playerTurn || gamePhase !== 'playing'}>
              Hit
            </button>
            <button className={styles.btn} onClick={stand} disabled={!playerTurn || gamePhase !== 'playing'}>
              Stand
            </button>
            {canDoubleDown(playerHand) && (
              <button className={`${styles.btn} ${styles.btnGhost}`} onClick={doubleDown} disabled={!playerTurn || gamePhase !== 'playing' || !hasEnoughFundsForAction('double')}>
                Double
              </button>
            )}
            {canSplit(playerHand) && (
              <button className={`${styles.btn} ${styles.btnGhost}`} onClick={split} disabled={!playerTurn || gamePhase !== 'playing' || !hasEnoughFundsForAction('split')}>
                Split
              </button>
            )}
          </div>
        ) : (
          <div className={styles.betPanel}>
            <div className={styles.betDisplay}>
              <span className={styles.betLabel}>Bet</span>
              <span className={styles.betValue}>${currentBet}</span>
            </div>
            <div className={styles.chipRow}>
              <button className={styles.chip} onClick={() => adjustBet(-5)} disabled={currentBet <= 5}>−5</button>
              <button className={styles.chip} onClick={() => adjustBet(-1)} disabled={currentBet <= 5}>−1</button>
              <button className={`${styles.chip} ${styles.chipPreset}`} onClick={() => setBet(10)} disabled={balance < 10}>$10</button>
              <button className={`${styles.chip} ${styles.chipPreset}`} onClick={() => setBet(25)} disabled={balance < 25}>$25</button>
              <button className={`${styles.chip} ${styles.chipPreset}`} onClick={() => setBet(50)} disabled={balance < 50}>$50</button>
              <button className={styles.chip} onClick={() => adjustBet(1)} disabled={currentBet >= balance}>+1</button>
              <button className={styles.chip} onClick={() => adjustBet(5)} disabled={currentBet >= balance}>+5</button>
            </div>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={startRound} disabled={balance < currentBet || gameOver}>
              Deal
            </button>
          </div>
        )}

        {/* HUD */}
        <div className={styles.hud}>
          <span className={styles.hudItem}>
            <span className={styles.hudLabel}>{mode === 'offline' ? 'Offline' : 'Online'}</span>
          </span>
          <span className={styles.hudDivider}>·</span>
          <span className={styles.hudItem}>
            <span className={styles.hudLabel}>Balance</span>
            <span className={styles.hudValue}>${balance}</span>
          </span>
          <span className={styles.hudDivider}>·</span>
          <span className={styles.hudItem}>
            <span className={styles.hudLabel}>Bet</span>
            <span className={styles.hudValue}>${currentBet}</span>
          </span>
        </div>
      </div>

      {/* Sliding leaderboard panel */}
      <div className={`${styles.panel} ${showLeaderboard ? styles.panelOpen : ''}`}>
        <div className={styles.panelHeader}>
          <h3>🏆 Leaderboard</h3>
          <button className={styles.panelClose} onClick={() => setShowLeaderboard(false)}>×</button>
        </div>
        <div className={styles.panelBody}>
          {leaderboardData.length > 0 ? (
            leaderboardData.map((entry, index) => (
              <div key={entry.id} className={styles.row}>
                <span className={styles.lrRank}>#{index + 1}</span>
                <span className={styles.lrName}>{entry.user.username || entry.user.name}</span>
                <span className={styles.lrBalance}>${entry.balance}</span>
              </div>
            ))
          ) : (
            <div className={styles.row}><span className={styles.rowKey}>No scores yet</span></div>
          )}
        </div>
      </div>

      {/* Sliding stats panel */}
      <div className={`${styles.panel} ${showStats ? styles.panelOpen : ''}`} style={{ zIndex: 101 }}>
        <div className={styles.panelHeader}>
          <h3>📊 Stats</h3>
          <button className={styles.panelClose} onClick={() => setShowStats(false)}>×</button>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.row}><span className={styles.rowKey}>Total Hands Played</span><span className={styles.rowVal}>{stats.totalHands}</span></div>
          <div className={styles.row}><span className={styles.rowKey}>Win Rate</span><span className={styles.rowVal}>{stats.totalHands ? ((stats.wins / stats.totalHands) * 100).toFixed(1) + '%' : '0%'}</span></div>
          <div className={styles.row}><span className={styles.rowKey}>Blackjacks</span><span className={styles.rowVal}>{stats.blackjacks}</span></div>
          <div className={styles.row}><span className={styles.rowKey}>Current Win Streak</span><span className={styles.rowVal}>{stats.currentWinStreak}</span></div>
          <div className={styles.row}><span className={styles.rowKey}>Best Win Streak</span><span className={styles.rowVal}>{stats.bestWinStreak}</span></div>
          <div className={styles.row}><span className={styles.rowKey}>Current Loss Streak</span><span className={styles.rowVal}>{stats.currentLossStreak}</span></div>
          <div className={styles.row}><span className={styles.rowKey}>Best Loss Streak</span><span className={styles.rowVal}>{stats.bestLossStreak}</span></div>
          <div className={styles.row}><span className={styles.rowKey}>Average Bet Size</span><span className={styles.rowVal}>{stats.totalHands ? (stats.totalBet / stats.totalHands).toFixed(2) : '0'}</span></div>
          <div className={styles.row}><span className={styles.rowKey}>Most Drawn Card</span><span className={styles.rowVal}>{stats.mostDrawnCard || '—'}</span></div>
          <div className={styles.row}><span className={styles.rowKey}>5+ Cards w/o Busting</span><span className={styles.rowVal}>{stats.fiveCardCharlies}</span></div>
        </div>
      </div>
    </div>
  );
}

function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <div className={styles.leaderCard}>
      <div className={styles.leaderTitle}>🏆 Top Players</div>
      <div className={styles.leaderList}>
        {entries.slice(0, 10).map((entry, index) => (
          <div key={entry.id} className={styles.leaderRow}>
            <span className={styles.lrRank}>#{index + 1}</span>
            <span className={styles.lrName}>{entry.user.username || entry.user.name}</span>
            <span className={styles.lrBalance}>${entry.balance}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const { data: session, status } = useSession();
  const [offlineMode, setOfflineMode] = useState(false);
  const [onlineMode, setOnlineMode] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [userCurrentBalance, setUserCurrentBalance] = useState(100);
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [persistentStats, setPersistentStats] = useState<any>(null);

  useEffect(() => {
    // Function to check if the device is mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 600);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fetch leaderboard
  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const response = await fetch('/api/scores');
        if (response.ok) {
          const data = await response.json();
          setLeaderboard(data);
        }
      } catch (error) {
        console.error('Error fetching leaderboard:', error);
      }
    };

    fetchLeaderboard();
  }, []);

  // Fetch user's current balance
  useEffect(() => {
    const fetchUserBalance = async () => {
      if (session?.user) {
        try {
          const response = await fetch('/api/user/score');
          if (response.ok) {
            const data = await response.json();
            setUserCurrentBalance(data.currentBalance);
            setPersistentStats({
              totalHands: data.totalHands,
              wins: data.wins,
              losses: data.losses,
              pushes: data.pushes,
              blackjacks: data.blackjacks,
              bestWinStreak: data.bestWinStreak,
              bestLossStreak: data.bestLossStreak,
              totalBet: data.totalBet,
              mostDrawnCard: data.mostDrawnCard,
              fiveCardCharlies: data.fiveCardCharlies,
            });
          }
        } catch (error) {
          console.error('Error fetching user balance:', error);
        }
      }
    };

    fetchUserBalance();
  }, [session]);

  // Fetch user profile after login
  useEffect(() => {
    const fetchProfile = async () => {
      if (session?.user?.email) {
        const res = await fetch('/api/user/score');
        if (res.ok) {
          const data = await res.json();
          setUserProfile(data.user || {});
          if (!data.user?.username) {
            setShowUsernameModal(true);
          }
        }
      }
    };
    if (session?.user) {
      fetchProfile();
    }
  }, [session]);

  const handleSaveBalance = async (balance: number, stats?: any) => {
    if (!session?.user) return;

    try {
      const body = { balance, ...(stats || {}) };
      const response = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        // Refresh leaderboard
        const leaderboardResponse = await fetch('/api/scores');
        if (leaderboardResponse.ok) {
          const data = await leaderboardResponse.json();
          setLeaderboard(data);
        }
      }
    } catch (error) {
      console.error('Error saving balance:', error);
    }
  };

  const handleSignIn = async () => {
    setLoading(true);
    await signIn('google');
  };

  const handleSignOut = async () => {
    setLoading(true);
    await signOut();
    setOnlineMode(false);
    setLoading(false);
  };

  // Username modal submit handler
  const handleUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUsernameError('');
    setCheckingUsername(true);
    const username = usernameInput.trim();
    if (!username || username.length < 3) {
      setUsernameError('Username must be at least 3 characters.');
      setCheckingUsername(false);
      return;
    }
    // Check and set username via API
    const res = await fetch('/api/user/username', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    if (res.ok) {
      setShowUsernameModal(false);
      setUserProfile((u: any) => ({ ...u, username }));
    } else {
      const data = await res.json();
      setUsernameError(data.error || 'Unknown error');
    }
    setCheckingUsername(false);
  };

  if (offlineMode) {
    return <PlackGackGame mode="offline" onExit={() => setOfflineMode(false)} isMobile={isMobile} />;
  }

  if (onlineMode && session?.user) {
    return (
      <PlackGackGame
        mode="online"
        user={session.user as User}
        persistentBalance={userCurrentBalance}
        persistentStats={persistentStats}
        onExit={() => setOnlineMode(false)}
        onSaveBalance={handleSaveBalance}
        isMobile={isMobile}
      />
    );
  }

  if (status === 'loading' || loading) {
    return <div className={styles.loading}>Loading…</div>;
  }

  return (
    <div className={styles.landing}>
      <div className={styles.titleWrap}>
        {isMobile ? (
          <img
            src="/title-mobile.png.png"
            alt="Plack Gack"
            style={{ maxWidth: '100vw', width: '100%', height: 'auto', display: 'block', margin: '0 auto' }}
          />
        ) : (
          <pre className={styles.asciiTitle}>
{`██████╗ ██╗      █████╗  ██████╗██╗  ██╗     ██████╗  █████╗  ██████╗██╗  ██╗
██╔══██╗██║     ██╔══██╗██╔════╝██║ ██╔╝    ██╔════╝ ██╔══██╗██╔════╝██║ ██╔╝
██████╔╝██║     ███████║██║     █████╔╝     ██║  ███╗███████║██║     █████╔╝
██╔═══╝ ██║     ██╔══██║██║     ██╔═██╗     ██║   ██║██╔══██║██║     ██╔═██╗
██║     ███████╗██║  ██║╚██████╗██║  ██╗    ╚██████╔╝██║  ██║╚██████╗██║  ██╗
╚═╝     ╚══════╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝     ╚═════╝ ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝
`}
          </pre>
        )}
      </div>

      <div className={styles.tagline}>Hit 21 · Top the board</div>

      {session?.user ? (
        <>
          <div className={styles.welcome}>
            Welcome back, <strong>{session.user.name}</strong><br />
            Balance: <strong>${userCurrentBalance}</strong>
          </div>
          <div className={styles.landingActions}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setOnlineMode(true)}>
              Play Online
            </button>
            <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setOfflineMode(true)}>
              Play Offline
            </button>
            <button className={`${styles.btn} ${styles.btnGhost}`} onClick={handleSignOut}>
              Sign Out
            </button>
          </div>
        </>
      ) : (
        <>
          <div className={styles.landingActions}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleSignIn}>
              Sign in with Google
            </button>
            <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setOfflineMode(true)}>
              Play Offline
            </button>
          </div>
          <p className={styles.landingHint}>
            Sign in to track your balance and climb the leaderboard, or jump straight into offline play.
          </p>
        </>
      )}

      {leaderboard.length > 0 && (
        <Leaderboard entries={leaderboard} />
      )}

      {/* Username Modal */}
      {showUsernameModal && (
        <div className={styles.modalOverlay}>
          <form className={styles.modalCard} onSubmit={handleUsernameSubmit}>
            <h2 className={styles.modalTitle}>Choose a Username</h2>
            <input
              type="text"
              className={styles.modalInput}
              value={usernameInput}
              onChange={e => setUsernameInput(e.target.value)}
              placeholder="at least 3 characters"
              disabled={checkingUsername}
              autoFocus
            />
            {usernameError && <div className={styles.modalError}>{usernameError}</div>}
            <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={checkingUsername}>
              {checkingUsername ? 'Checking…' : 'Set Username'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
