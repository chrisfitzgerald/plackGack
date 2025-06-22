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
  mode: GameMode;
  onExit: () => void;
  onSaveBalance?: (balance: number) => void;
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

function PlackGackGame({ user, persistentBalance, mode, onExit, onSaveBalance }: PlackGackGameProps) {
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

  // Save balance function with debouncing
  const saveBalance = useCallback((newBalance: number) => {
    if (mode === 'online' && onSaveBalance && newBalance !== lastSavedBalance.current) {
      lastSavedBalance.current = newBalance;
      onSaveBalance(newBalance);
    }
  }, [mode, onSaveBalance]);

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
        const data = JSON.stringify({ balance });
        navigator.sendBeacon('/api/scores', data);
      }
    };

    if (mode === 'online') {
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  }, [mode, onSaveBalance, balance]);

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

    // Check for plack gack
    if (isPlackGack(player)) {
      setTimeout(() => {
        endRound('plackgack');
      }, 1000);
    }
  }

  // Player actions
  function hit() {
    if (!inRound || !playerTurn || gamePhase !== 'playing') return;
    const newDeck = [...deck];
    const newHands = [...playerHands];
    newHands[currentHandIndex] = [...newHands[currentHandIndex], newDeck.pop()!];
    setDeck(newDeck);
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
    if (balance < currentBet) {
      setMessage('Not enough funds to double down!');
      return;
    }
    
    const newDeck = [...deck];
    const newHands = [...playerHands];
    newHands[currentHandIndex] = [...newHands[currentHandIndex], newDeck.pop()!];
    setDeck(newDeck);
    setPlayerHands(newHands);
    setBalance(b => b - currentBet); // Additional bet for double down
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
  }

  function split() {
    if (!inRound || !playerTurn || gamePhase !== 'playing' || !canSplit(playerHand)) return;
    if (balance < currentBet) {
      setMessage('Not enough funds to split!');
      return;
    }
    
    const newDeck = [...deck];
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
    setBalance(b => b - currentBet); // Additional bet for split
    setCurrentHandIndex(currentHandIndex);
  }

  function endRound(reason: 'bust' | 'stand' | 'plackgack', finalDealerHand?: { value: string; suit: string }[]) {
    setInRound(false);
    setGamePhase('complete');
    setPlayerTurn(false);
    setShowDealer(true);
    
    const dealerValue = getHandValue(finalDealerHand || dealerHand);
    let resultMsg = '';
    let totalPayout = 0;
    
    if (reason === 'plackgack') {
      // Plack Gack pays 3:2
      const winnings = Math.floor(currentBet * 1.5);
      const totalPayout = winnings + currentBet;
      resultMsg = `Plack Gack! You win $${winnings} + your $${currentBet} bet back = $${totalPayout}!`;
      setBalance(b => b + totalPayout);
    } else if (reason === 'bust') {
      resultMsg = 'Bust! You lose your bet.';
    } else {
      // Calculate results for each hand
      const results = playerHands.map((hand, index) => {
        const playerValue = getHandValue(hand);
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
    const playerHandsStr = playerHands.map(hand => handToString(hand)).join(' | ');
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

  return (
    <div className={styles.gameContainer}>
      <button 
        className={styles.leaderboardBtn} 
        onClick={() => {
          if (!showLeaderboard) fetchLeaderboard();
          setShowLeaderboard(!showLeaderboard);
        }}
      >
        {showLeaderboard ? 'Hide' : 'Show'} Leaderboard
      </button>
      
      <button className={styles.logoutBtn} onClick={() => {
        // Save current state before exiting
        if (mode === 'online') {
          saveBalance(balance);
        }
        onExit();
      }}>
        [ Exit to Main Menu ]
      </button>

      {/* Faded game history log */}
      {mode === 'offline' && history.length > 0 && (
        <div className={styles.gameHistory} aria-hidden="true">
          {history.map((entry, i) => (
            <div key={i}>{entry}</div>
          ))}
        </div>
      )}
      
      <pre className={styles.terminalText}>
        {mode === 'offline'
          ? `${inRound ? '' : '\nPress [Deal] to start a new round.'}`
          : ''}
      </pre>
      
      {(inRound || message) && (
        <pre className={styles.terminalText}>
{`Dealer: ${showDealer ? handToString(dealerHand) + ' (' + getHandValue(dealerHand) + ')' : dealerHand[0]?.value + dealerHand[0]?.suit + ' ??'}
${playerHands.length > 1 ? `Hand ${currentHandIndex + 1}: ` : 'You:    '}${handToString(playerHand)} (${getHandValue(playerHand)})${playerHands.length > 1 ? ` [${playerHands.length} hands]` : ''}${doubledDownHands.has(currentHandIndex) ? ' [DOUBLE]' : ''}`}
        </pre>
      )}
      
      {message && (
        <pre className={styles.terminalText}>{message}</pre>
      )}
      
      {gameOver && (
        <pre className={styles.terminalText}>
          {`Game over! You ran out of money.`}
        </pre>
      )}
      
      <div className={styles.terminalPrompt}>
        {inRound ? (
          <>
            <button className={styles.signInBtn} onClick={hit} disabled={!playerTurn || gamePhase !== 'playing'}>
              Hit
            </button>
            <button className={styles.offlineBtn} onClick={stand} disabled={!playerTurn || gamePhase !== 'playing'}>
              Stand
            </button>
            {canDoubleDown(playerHand) && (
              <button className={styles.offlineBtn} onClick={doubleDown} disabled={!playerTurn || gamePhase !== 'playing' || balance < currentBet}>
                Double
              </button>
            )}
            {canSplit(playerHand) && (
              <button className={styles.offlineBtn} onClick={split} disabled={!playerTurn || gamePhase !== 'playing' || balance < currentBet}>
                Split
              </button>
            )}
          </>
        ) : (
          <>
            <button className={styles.signInBtn} onClick={startRound} disabled={balance < currentBet}>
              Deal
            </button>
          </>
        )}
      </div>
      
      {/* Betting interface */}
      {!inRound && (
        <div className={styles.bettingInterface}>
          <pre className={styles.terminalText}>
            {`Current Bet: $${currentBet}`}
          </pre>
          <div className={styles.betControls}>
            <button className={styles.signInBtn} onClick={() => adjustBet(-5)} disabled={currentBet <= 5}>
              -$5
            </button>
            <button className={styles.signInBtn} onClick={() => adjustBet(-1)} disabled={currentBet <= 5}>
              -$1
            </button>
            <button className={styles.signInBtn} onClick={() => setBet(10)}>
              $10
            </button>
            <button className={styles.signInBtn} onClick={() => setBet(25)}>
              $25
            </button>
            <button className={styles.signInBtn} onClick={() => setBet(50)}>
              $50
            </button>
            <button className={styles.signInBtn} onClick={() => adjustBet(1)} disabled={currentBet >= balance}>
              +$1
            </button>
            <button className={styles.signInBtn} onClick={() => adjustBet(5)} disabled={currentBet >= balance}>
              +$5
            </button>
          </div>
        </div>
      )}
      
      {/* Bottom center mode info */}
      <div className={styles.offlineInfo}>
        [{mode === 'offline' ? 'Offline' : 'Online'} Mode] &nbsp;|&nbsp; Balance: ${balance} &nbsp;|&nbsp; Bet: ${currentBet} &nbsp;|&nbsp; 
      </div>

      {/* Sliding Leaderboard from Bottom */}
      <div className={`${styles.leaderboardSlide} ${showLeaderboard ? styles.leaderboardSlideOpen : ''}`}>
        <div className={styles.leaderboardSlideHeader}>
          <h3>🏆 Leaderboard</h3>
          <button 
            className={styles.leaderboardCloseBtn}
            onClick={() => setShowLeaderboard(false)}
          >
            ×
          </button>
        </div>
        <div className={styles.leaderboardSlideList}>
          {leaderboardData.length > 0 ? (
            leaderboardData.map((entry, index) => (
              <div key={entry.id} className={styles.leaderboardSlideEntry}>
                <span className={styles.rank}>#{index + 1}</span>
                <span className={styles.playerName}>{entry.user.username || entry.user.name}</span>
                <span className={styles.balance}>${entry.balance}</span>
              </div>
            ))
          ) : (
            <div className={styles.leaderboardSlideEntry}>
              <span>No scores yet</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <div className={styles.leaderboard}>
      <h2>🏆 Leaderboard</h2>
      <div className={styles.leaderboardList}>
        {entries.map((entry, index) => (
          <div key={entry.id} className={styles.leaderboardEntry}>
            <span className={styles.rank}>#{index + 1}</span>
            <span className={styles.playerName}>{entry.user.username || entry.user.name}</span>
            <span className={styles.balance}>${entry.balance}</span>
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

  const handleSaveBalance = async (balance: number) => {
    if (!session?.user) return;
    
    try {
      const response = await fetch('/api/scores', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ balance }),
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
    return <PlackGackGame mode="offline" onExit={() => setOfflineMode(false)} />;
  }

  if (onlineMode && session?.user) {
    return (
      <PlackGackGame 
        mode="online" 
        user={session.user as User}
        persistentBalance={userCurrentBalance}
        onExit={() => setOnlineMode(false)}
        onSaveBalance={handleSaveBalance}
      />
    );
  }

  if (status === 'loading' || loading) {
    return (
      <div className={styles.terminalBg}>
        <pre className={styles.terminalText}>Loading...</pre>
      </div>
    );
  }

  return (
    <div className={styles.terminalBg}>
      <div className="ascii-art-container" style={{ width: '100vw', maxWidth: '100vw', overflow: 'hidden', justifyContent: 'center', display: 'flex' }}>
        {isMobile ? (
          <img
            src="/title-mobile.png.png"
            alt="Game Title"
            style={{ maxWidth: '100vw', width: '100%', height: 'auto', display: 'block', margin: '0 auto' }}
          />
        ) : (
          <pre
            className={styles.terminalText}
            style={{ fontSize: 'clamp(0.7rem, 2vw, 1.1rem)', width: '100%', overflowX: 'auto', textAlign: 'center', margin: 0 }}
          >
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
      
      {session?.user ? (
        <div className={styles.userInfo}>
          <pre className={styles.terminalText}>
            {`Welcome back, ${session.user.name}!\nCurrent Balance: $${userCurrentBalance}`}
          </pre>
          <div className={styles.terminalPrompt}>
            <button className={styles.signInBtn} onClick={() => setOnlineMode(true)}>
              Play Online
            </button>
            <button className={styles.offlineBtn} onClick={() => setOfflineMode(true)}>
              Play Offline
            </button>
            <button className={styles.offlineBtn} onClick={handleSignOut}>
              Sign Out
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.terminalPrompt}>
          <button className={styles.signInBtn} onClick={handleSignIn}>
            Sign in with Google
          </button>
          <button className={styles.offlineBtn} onClick={() => setOfflineMode(true)}>
            Play Offline
          </button>
        </div>
      )}
      
      <div className={styles.terminalInfo}>
        <p>Sign in to start playing and track your balance, or play offline.</p>
      </div>

      {leaderboard.length > 0 && (
        <Leaderboard entries={leaderboard} />
      )}

      {/* Username Modal */}
      {showUsernameModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#39ff14', fontFamily: 'Fira Mono, Consolas, Menlo, monospace',
        }}>
          <form onSubmit={handleUsernameSubmit} style={{ background: '#222', padding: 32, borderRadius: 12, boxShadow: '0 0 16px #39ff14', minWidth: 300, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h2 style={{ marginBottom: 16 }}>Choose a Username</h2>
            <input
              type="text"
              value={usernameInput}
              onChange={e => setUsernameInput(e.target.value)}
              style={{ padding: 8, fontSize: 18, borderRadius: 6, border: '1px solid #39ff14', marginBottom: 12, width: '100%' }}
              disabled={checkingUsername}
              autoFocus
            />
            {usernameError && <div style={{ color: '#ff3939', marginBottom: 8 }}>{usernameError}</div>}
            <button type="submit" style={{ background: '#39ff14', color: '#222', fontWeight: 'bold', border: 'none', borderRadius: 6, padding: '8px 24px', fontSize: 18, cursor: 'pointer' }} disabled={checkingUsername}>
              {checkingUsername ? 'Checking...' : 'Set Username'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
