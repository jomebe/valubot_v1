import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase.js';
import { valorantApi } from '../utils/valorantApi.js';
import { createCanvas, loadImage, registerFont } from 'canvas';
import path from 'path';
import { fileURLToPath } from 'url';
import { AttachmentBuilder } from 'discord.js';
import fs from 'fs';
import axios from 'axios';

// __dirname 설정 (ES 모듈에서 필요)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 더 예쁜 한글 폰트 사용 (기본 시스템 폰트 포함)
const KOREAN_FONTS = '"Pretendard", "Noto Sans KR", "넥슨 Lv.2 고딕", "에스코어 드림", "Gmarket Sans", "IBM Plex Sans KR", Arial, sans-serif';


// 폰트 설정 함수 단순화
function setFont(ctx, size, isBold = false) {
  const weight = isBold ? 'bold' : 'normal';
  ctx.font = `${weight} ${size}px ${KOREAN_FONTS}`;
}

// 플레이어 데이터를 가져오는 함수 수정
async function getPlayerData(player) {
  try {
    // 에이전트 아이콘 로드 (캐시 사용)
    const agentIcons = await valorantApi.getAgents();
    
    // 티어 아이콘 로드 (캐시 사용)
    const tierIcons = await valorantApi.getTierIcons();
    
    // 먼저 계정 정보를 조회하여 region 확인
    const accountResponse = await axios.get(
      `https://api.henrikdev.xyz/valorant/v1/account/${encodeURIComponent(player.name)}/${encodeURIComponent(player.tag)}`,
      { headers: { 'Authorization': process.env.VALORANT_API_KEY } }
    );

    const region = accountResponse.data.data.region;
    const playerCardUrl = accountResponse.data.data.card.small;
    const accountLevel = accountResponse.data.data.account_level;

    // MMR 정보 조회
    const mmrResponse = await axios.get(
      `https://api.henrikdev.xyz/valorant/v2/by-puuid/mmr/${region}/${accountResponse.data.data.puuid}`,
      { headers: { 'Authorization': process.env.VALORANT_API_KEY } }
    );

    // 최근 경기 기록 조회
    const matchesResponse = await axios.get(
      `https://api.henrikdev.xyz/valorant/v3/by-puuid/matches/${region}/${accountResponse.data.data.puuid}?size=10`,
      { headers: { 'Authorization': process.env.VALORANT_API_KEY } }
    );

    if (matchesResponse.data.data.length === 0) {
      throw new Error(`❌ ${player.name}#${player.tag}의 최근 경기 기록이 없습니다.`);
    }

    // 맵별 승/패 통계 계산
    const mapStats = {};
    for (const match of matchesResponse.data.data) {
      const playerData = match.players.all_players.find(
        p => p.name.toLowerCase() === player.name.toLowerCase() && p.tag.toLowerCase() === player.tag.toLowerCase()
      );
      
      if (playerData) {
        const map = match.metadata.map;
        const playerTeam = playerData.team.toLowerCase();
        const wonMatch = (playerTeam === 'red' && match.teams.red.has_won) || 
                        (playerTeam === 'blue' && match.teams.blue.has_won);
        
        if (!mapStats[map]) {
          mapStats[map] = { wins: 0, losses: 0 };
        }
        
        if (wonMatch) {
          mapStats[map].wins++;
        } else {
          mapStats[map].losses++;
        }
      }
    }

    // 에이전트 통계를 위한 데이터 추출
    const agentStats = {};
    let mostPlayedAgent = null;
    let mostPlayedCount = 0;
    
    for (const match of matchesResponse.data.data) {
      const playerData = match.players.all_players.find(
        p => p.name.toLowerCase() === player.name.toLowerCase() && p.tag.toLowerCase() === player.tag.toLowerCase()
      );
      
      if (playerData) {
        const agent = playerData.character;
        if (!agentStats[agent]) {
          agentStats[agent] = {
            count: 0
          };
        }
        agentStats[agent].count++;
        
        if (agentStats[agent].count > mostPlayedCount) {
          mostPlayedCount = agentStats[agent].count;
          mostPlayedAgent = agent;
        }
      }
    }

    return {
      mmr: mmrResponse.data.data,
      matches: matchesResponse.data.data,
      playerCard: playerCardUrl,
      mapStats: mapStats,
      accountLevel: accountLevel,
      agentStats: agentStats,
      mostPlayedAgent: mostPlayedAgent
    };
  } catch (error) {
    console.error('플레이어 데이터 조회 오류:', error);
    if (error.response && error.response.status === 404) {
      throw new Error(`❌ ${player.name}#${player.tag}의 정보를 찾을 수 없습니다.`);
    }
    throw new Error(`❌ API 호출 중 오류가 발생했습니다: ${error.message}`);
  }
}

// MMR 데이터에서 승률 통계 가져오기
function calculateStats(matches, playerName, playerTag, providedMostPlayedAgent, mmrData) {
  // 기본 통계 초기화
  let stats = {
    kills: 0,
    deaths: 0,
    assists: 0,
    headshots: 0,
    bodyshots: 0,
    legshots: 0,
    wins: 0,
    games: 0,
    damage: 0,
    score: 0,
    firstBloods: 0,
    plants: 0,
    defuses: 0,
    clutches: 0,
    mostKillsInMatch: 0,
    highestScore: 0,
    mostPlayedAgent: providedMostPlayedAgent || "Unknown"
  };
  
  // MMR 데이터에서 승률 정보 가져오기
  if (mmrData && mmrData.by_season) {
    // 기존 MMR 데이터 처리 코드는 제거
    // 매치 데이터로만 승률을 계산하도록 수정
  }
  
  // 매치 데이터 처리
  let validGames = 0;
  let wins = 0;  // 승리 수를 별도로 추적

  if (matches && Array.isArray(matches)) {
    matches.forEach(match => {
      try {
        if (!match.players || !match.players.all_players) return;
        
        const player = match.players.all_players.find(p => 
          p.name?.toLowerCase() === playerName?.toLowerCase() && 
          p.tag?.toLowerCase() === playerTag?.toLowerCase()
        );
        
        if (!player || !player.stats) return;
        
        validGames++;

        // 킬/데스/어시스트 등 기본 스탯
        stats.kills += player.stats.kills || 0;
        stats.deaths += player.stats.deaths || 0;
        stats.assists += player.stats.assists || 0;
        stats.damage += player.damage_made || 0;
        stats.score += player.stats.score || 0;
        
        // 헤드샷/바디샷/레그샷
        stats.headshots += player.stats.headshots || 0;
        stats.bodyshots += player.stats.bodyshots || 0;
        stats.legshots += player.stats.legshots || 0;
        
        // 매치당 최고 킬/스코어 업데이트
        if ((player.stats.kills || 0) > stats.mostKillsInMatch) {
          stats.mostKillsInMatch = player.stats.kills;
        }
        
        if ((player.stats.score || 0) > stats.highestScore) {
          stats.highestScore = player.stats.score;
        }

        // 승패 계산 수정
        if (match.teams && player.team) {
          const playerTeam = player.team.toLowerCase();
          if (match.teams[playerTeam] && match.teams[playerTeam].has_won) {
            wins++;  // 승리 수 증가
          }
        }
      } catch (err) {
        console.error('스탯 처리 오류:', err);
      }
    });
  }

  // 실제 플레이한 게임 수 저장
  stats.games = validGames;
  stats.wins = wins;  // 승리 수 저장

  // 평균 계산 (0으로 나누기 방지)
  const gameCount = Math.max(1, validGames);
  stats.avgKills = (stats.kills / gameCount).toFixed(1);
  stats.avgDeaths = (stats.deaths / gameCount).toFixed(1);
  stats.avgAssists = (stats.assists / gameCount).toFixed(1);
  stats.avgDamage = Math.round(stats.damage / gameCount);
  stats.avgScore = Math.round(stats.score / gameCount);

  // KDA 계산
  stats.kda = stats.deaths > 0 
    ? ((stats.kills + stats.assists) / stats.deaths).toFixed(2) 
    : ((stats.kills + stats.assists) > 0 ? '∞' : '0.00');

  // 승률 계산 수정
  stats.winRate = validGames > 0 ? Math.round((wins / validGames) * 100) : 0;

  // 헤드샷 비율 계산
  const totalShots = stats.headshots + stats.bodyshots + stats.legshots;
  stats.headshotPercent = totalShots > 0 ? Math.round((stats.headshots / totalShots) * 100) : 0;
  stats.bodyshotPercent = totalShots > 0 ? Math.round((stats.bodyshots / totalShots) * 100) : 0;
  stats.legshotPercent = totalShots > 0 ? Math.round((stats.legshots / totalShots) * 100) : 0;

  return stats;
}

// 평균값 계산 함수 - 승률 계산 수정
function calculateAverages(stats, matchCount) {
  const validMatches = Math.max(1, matchCount); // 0으로 나누기 방지
  
  // 샷 분포 계산
  const totalShots = stats.headshots + stats.bodyshots + stats.legshots;
  const headshotPercent = totalShots > 0 ? Math.round((stats.headshots / totalShots) * 100) : 0;
  const bodyshotPercent = totalShots > 0 ? Math.round((stats.bodyshots / totalShots) * 100) : 0;
  const legshotPercent = totalShots > 0 ? Math.round((stats.legshots / totalShots) * 100) : 0;
  
  // 평균 계산
  const avgKills = (stats.kills / validMatches).toFixed(1);
  const avgDeaths = (stats.deaths / validMatches).toFixed(1);
  const avgAssists = (stats.assists / validMatches).toFixed(1);
  const avgDamage = Math.round(stats.damage / validMatches);
  const avgScore = Math.round(stats.score / validMatches);
  
  // KDA 계산 (0으로 나누기 방지)
  const kda = stats.deaths > 0 ? 
    ((stats.kills + stats.assists) / stats.deaths).toFixed(2) : 
    ((stats.kills + stats.assists) > 0 ? '∞' : '0.00');
  
  // 승률 계산 - 더 명확하게
  const winRate = stats.games > 0 ? Math.round((stats.wins / stats.games) * 100) : 0;
  console.log(`승률 계산: ${stats.wins}승 / ${stats.games}게임 = ${winRate}%`);
  
  return {
    ...stats,
    avgKills,
    avgDeaths,
    avgAssists,
    avgDamage,
    avgScore,
    kda,
    winRate,
    headshotPercent,
    bodyshotPercent,
    legshotPercent
  };
}

function getComparisonEmoji(val1, val2) {
  if (val1 > val2) return '🟢';
  if (val1 < val2) return '🔴';
  return '⚪';
}

function formatComparison(label, val1, val2, reverse = false, format = '') {
  const emoji = reverse ? 
    getComparisonEmoji(parseFloat(val2), parseFloat(val1)) : 
    getComparisonEmoji(parseFloat(val1), parseFloat(val2));
  
  // 숫자 포맷팅
  if (format === 'percent') {
    val1 = !isNaN(val1) ? parseFloat(val1).toFixed(1) + '%' : '0%';
    val2 = !isNaN(val2) ? parseFloat(val2).toFixed(1) + '%' : '0%';
  }

  return `${emoji} ${label}: **${val1}** vs **${val2}**`;
}

function formatKDA(kills, deaths, assists) {
  return `${kills}/${deaths}/${assists}`;
}

// 캔버스 생성 함수 수정 - RR 크기 줄이기, 제목 박스 늘리기
async function createComparisonImage(player1, player2, stats1, stats2, player1Data, player2Data) {
  // 요원 정보와 티어 정보를 병렬로 가져오기
  const [agentIcons, tierIcons] = await Promise.all([
    valorantApi.getAgents(),
    valorantApi.getTierIcons()
  ]);

  const width = 1000;
  const height = 600;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 배경
  ctx.fillStyle = '#0F1923';
  ctx.fillRect(0, 0, width, height);

  // 상단 제목 박스
  ctx.fillStyle = '#1F2326';
  ctx.fillRect(0, 0, width, 100);

  // 제목 텍스트
  setFont(ctx, 36, true);
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText(`${player1.name} vs ${player2.name}`, width / 2, 60);

  // 플레이어 카드 이미지 로드 시도
  let player1CardImg, player2CardImg;
  let agent1Img, agent2Img;
  
  try {
    // 기본 이미지 미리 로드
    const defaultAgentImg = await loadImage('https://i.imgur.com/G53MXS3.png');
    agent1Img = defaultAgentImg;
    agent2Img = defaultAgentImg;
    
    // 플레이어 카드 이미지
    if (player1Data.playerCard) {
      player1CardImg = await loadImage(player1Data.playerCard).catch(() => null);
    }
    if (player2Data.playerCard) {
      player2CardImg = await loadImage(player2Data.playerCard).catch(() => null);
    }
    
    // 에이전트 이미지를 안전하게 로드
    const agent1Name = stats1.mostPlayedAgent || null;
    const agent2Name = stats2.mostPlayedAgent || null;
    
    console.log('에이전트1:', agent1Name);
    console.log('에이전트2:', agent2Name);
    
    if (agent1Name && agentIcons && agentIcons[agent1Name]) {
      agent1Img = await loadImage(agentIcons[agent1Name]).catch(() => defaultAgentImg);
    }
    
    if (agent2Name && agentIcons && agentIcons[agent2Name]) {
      agent2Img = await loadImage(agentIcons[agent2Name]).catch(() => defaultAgentImg);
    }

    // 에이전트 이미지 로드 및 그리기
    const iconSize = 120;  // 아이콘 크기 증가
    const margin = 50;     // 여백 조정
    const yPos = 20;       // y 위치 조정

    // 플레이어 1 아이콘
    ctx.save();
    ctx.beginPath();
    ctx.arc(margin + iconSize/2, yPos + iconSize/2, iconSize/2, 0, Math.PI * 2);
    ctx.clip();
    if (agent1Img) {
      ctx.drawImage(agent1Img, margin, yPos, iconSize, iconSize);
    }
    ctx.restore();

    // 플레이어 2 아이콘
    ctx.save();
    ctx.beginPath();
    ctx.arc(width - margin - iconSize/2, yPos + iconSize/2, iconSize/2, 0, Math.PI * 2);
    ctx.clip();
    if (agent2Img) {
      ctx.drawImage(agent2Img, width - margin - iconSize, yPos, iconSize, iconSize);
    }
    ctx.restore();

    // 아이콘 테두리 추가
    ctx.strokeStyle = '#FF4654';
    ctx.lineWidth = 3;
    
    // 플레이어 1 테두리
    ctx.beginPath();
    ctx.arc(margin + iconSize/2, yPos + iconSize/2, iconSize/2, 0, Math.PI * 2);
    ctx.stroke();
    
    // 플레이어 2 테두리
    ctx.beginPath();
    ctx.arc(width - margin - iconSize/2, yPos + iconSize/2, iconSize/2, 0, Math.PI * 2);
    ctx.stroke();

  } catch (error) {
    console.error('이미지 로딩 실패:', error);
  }
  
  // 좌우 패널 생성
  function drawPanel(x, side) {
    // 패널 배경
    ctx.fillStyle = '#1A242D';
    ctx.fillRect(x, 70, 460, 400);
    
    // 패널 테두리 (각진 효과)
    ctx.strokeStyle = side === 'left' ? '#9966CC' : '#53b18c';
    ctx.lineWidth = 3;
    
    ctx.beginPath();
    ctx.moveTo(x, 70);
    ctx.lineTo(x + 460, 70);
    ctx.lineTo(x + 460, 470);
    ctx.lineTo(x + 30, 470);
    ctx.lineTo(x, 440);
    ctx.lineTo(x, 70);
    ctx.stroke();
    
    // 각진 모서리에 발로란트 스타일 액센트
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(x + 460, 70);
    ctx.lineTo(x + 460, 85);
    ctx.lineTo(x + 445, 70);
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(x, 440);
    ctx.lineTo(x + 15, 440);
    ctx.lineTo(x + 30, 455);
    ctx.lineTo(x + 30, 470);
    ctx.lineTo(x + 15, 470);
    ctx.lineTo(x, 455);
    ctx.fill();
    
    // 상단 강조 선
    ctx.beginPath();
    ctx.moveTo(x, 70);
    ctx.lineTo(x + 100, 70);
    ctx.lineWidth = 6;
    ctx.stroke();
    
    ctx.lineWidth = 3;
  }
  
  // 좌우 패널 그리기
  drawPanel(50, 'left');
  drawPanel(690, 'right');
  
  // 제목 배경 - 가로 크기 늘림
  ctx.fillStyle = 'rgba(15, 25, 35, 0.9)';
  ctx.fillRect(width/2 - 250, 10, 500, 50); // 400 → 500으로 늘림
  
  ctx.strokeStyle = '#FF4654';
  ctx.lineWidth = 3;
  ctx.strokeRect(width/2 - 250, 10, 500, 50); // 400 → 500으로 늘림
  
  // 제목 텍스트 (발로란트 스타일)
  setFont(ctx, 40, true);
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText('PLAYER COMPARISON', width / 2, 50);
  
  // 헤드라인 하단 선 - 길이 늘림
  ctx.strokeStyle = '#FF4654';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width/2 - 200, 60);
  ctx.lineTo(width/2 + 200, 60); // 길이 늘림
  ctx.stroke();

  // 플레이어 1 정보
  const tier1 = player1Data.mmr.current_data.currenttierpatched;
  const rr1 = player1Data.mmr.current_data.ranking_in_tier;
  const level1 = player1Data.accountLevel || 0;
  const tier1Base = tier1.split(' ')[0];
  
  // 플레이어 2 정보
  const tier2 = player2Data.mmr.current_data.currenttierpatched;
  const rr2 = player2Data.mmr.current_data.ranking_in_tier;
  const level2 = player2Data.accountLevel || 0;
  const tier2Base = tier2.split(' ')[0];
  
  // 플레이어 이름 배경 (왼쪽)
  ctx.fillStyle = side => side === 'left' ? '#9966CC' : '#53b18c';
  ctx.fillStyle = '#9966CC';
  ctx.fillRect(70, 90, 420, 50);
  
  // 플레이어 이름 배경 (오른쪽)
  ctx.fillStyle = '#53b18c';
  ctx.fillRect(710, 90, 420, 50);
  
  // 플레이어 이름 (텍스트 길이에 따라 크기 조정)
  function drawPlayerName(name, tag, x, textAlign) {
    // 이름+태그 길이에 따라 글꼴 크기 조정
    const fullText = `${name}#${tag}`;
    let fontSize = 36; // 기본 크기
    
    if (fullText.length > 12) {
      fontSize = 32;
    }
    if (fullText.length > 15) {
      fontSize = 28;
    }
    if (fullText.length > 18) {
      fontSize = 24;
    }
    
    setFont(ctx, fontSize, true);
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = textAlign;
    ctx.fillText(fullText, x, 125);
  }
  
  drawPlayerName(player1.name, player1.tag, 280, 'center');
  drawPlayerName(player2.name, player2.tag, 920, 'center');
  
  // 티어 정보 배경 (왼쪽)
  ctx.fillStyle = '#36EBCA';
  ctx.fillRect(70, 160, 420, 65);
  
  // 티어 정보 배경 (오른쪽)
  ctx.fillStyle = '#36EBCA';
  ctx.fillRect(710, 160, 420, 65);
  
  // 티어 정보 - 레이아웃 개선 (RR 크기 줄이기)
  function drawTierInfo(tier, rr, level, x, textAlign) {
    // 티어와 RR
    setFont(ctx, 36, true);
    ctx.fillStyle = '#0F1923';
    ctx.textAlign = textAlign;
    
    // 티어 이름 길이에 따른 크기 조정
    let tierFontSize = 36;
    if (tier.length > 12) {
      tierFontSize = 30;
    }
    
    setFont(ctx, tierFontSize, true);
    
    // 레벨 정보 위치는 왼쪽/오른쪽에 따라 달라짐
    if (textAlign === 'left') {
      ctx.fillText(tier, x, 200);
      setFont(ctx, 22, true);
      ctx.fillText(`${rr} RR`, x, 220);
      
      // 레벨 정보 (오른쪽 정렬)
      setFont(ctx, 24, true);
      ctx.textAlign = 'right';
      ctx.fillText(`LVL ${level}`, x + 380, 200);
    } else {
      // 레벨 정보 (왼쪽 정렬)
      setFont(ctx, 24, true);
      ctx.textAlign = 'left';
      ctx.fillText(`LVL ${level}`, x - 380, 200);
      
      // 티어 정보 (오른쪽 정렬)
      setFont(ctx, tierFontSize, true);
      ctx.textAlign = 'right';
      ctx.fillText(tier, x, 200);
      setFont(ctx, 22, true);
      ctx.fillText(`${rr} RR`, x, 220);
    }
  }
  
  drawTierInfo(tier1, rr1, level1, 100, 'left');
  drawTierInfo(tier2, rr2, level2, 1100, 'right');
  
  // 에이전트 정보 표시
  function drawAgentInfo(x, agentImg, agentName, side) {
    const centerX = x + (side === 'left' ? 350 : 70);
    const radius = 50;
    
    // 원형 클리핑 마스크
    ctx.save();
    ctx.beginPath();
    const centerY = 300;
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    
    // 이미지 그리기
    ctx.drawImage(agentImg, centerX - radius, centerY - radius, radius * 2, radius * 2);
    ctx.restore();
    
    // 원형 테두리
    ctx.strokeStyle = side === 'left' ? '#9966CC' : '#53b18c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
    
    // 에이전트 이름 (길이에 따라 크기 조정)
    setFont(ctx, 24, true);
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = side === 'left' ? 'left' : 'right';
    
    // 간소화된 텍스트 레이아웃 (바운딩 박스 안에 유지되도록)
    const textX = side === 'left' ? x + 70 : x + 350;
    ctx.fillText(`AGENT: ${agentName}`, textX, 300);
  }
  
  drawAgentInfo(70, agent1Img, stats1.mostPlayedAgent, 'left');
  drawAgentInfo(710, agent2Img, stats2.mostPlayedAgent, 'right');
  
  // 중앙 VS 배경
  ctx.fillStyle = '#FF4654';
  const vsSize = 120;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 3 * i;
    const x = width / 2 + vsSize / 2 * Math.cos(angle);
    const y = 270 + vsSize / 2 * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  
  // VS 텍스트
  setFont(ctx, 60, true);
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText('VS', width / 2, 290);
  
  // 승패 통계
  function drawWinStats(x, wins, games, winRate, side) {
    const statsWidth = 400;
    const statsHeight = 110;
    const statsX = x + 30;
    const statsY = 360;
    
    ctx.fillStyle = 'rgba(26, 36, 45, 0.8)';
    ctx.fillRect(statsX, statsY, statsWidth, statsHeight);
    
    const labelAlign = side === 'left' ? 'left' : 'right';
    const valueAlign = side === 'left' ? 'right' : 'left';
    const labelX = side === 'left' ? statsX + 20 : statsX + statsWidth - 20;
    const valueX = side === 'left' ? statsX + statsWidth - 20 : statsX + 20;
    
    // 라벨 텍스트
    setFont(ctx, 26, true);
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = labelAlign;
    
    // 텍스트와 값 간격 개선
    ctx.fillText('WINS', labelX, statsY + 35);
    ctx.fillText('GAMES', labelX, statsY + 70);
    ctx.fillText('WINRATE', labelX, statsY + 105);
    
    // 값 텍스트
    setFont(ctx, 26, true);
    ctx.fillStyle = side === 'left' ? '#9966CC' : '#53b18c';
    ctx.textAlign = valueAlign;
    ctx.fillText(wins, valueX, statsY + 35);
    ctx.fillText(games, valueX, statsY + 70);
    ctx.fillText(`${winRate}%`, valueX, statsY + 105);
  }
  
  drawWinStats(50, stats1.wins, player1Data.matches.length, stats1.winRate, 'left');
  drawWinStats(690, stats2.wins, player2Data.matches.length, stats2.winRate, 'right');
  
  // 성능 통계 섹션 (하단)
  ctx.fillStyle = '#1A242D';
  ctx.fillRect(50, 500, 1100, 430);
  
  // 테두리
  ctx.strokeStyle = '#FF4654';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(50, 500);
  ctx.lineTo(1150, 500);
  ctx.lineTo(1150, 930);
  ctx.lineTo(100, 930);
  ctx.lineTo(50, 880);
  ctx.lineTo(50, 500);
  ctx.stroke();
  
  // 각진 모서리 강조
  ctx.fillStyle = '#FF4654';
  ctx.beginPath();
  ctx.moveTo(50, 880);
  ctx.lineTo(100, 930);
  ctx.lineTo(100, 880);
  ctx.fill();
  
  // 섹션 제목
  setFont(ctx, 40, true);
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText('PERFORMANCE STATS', width / 2, 550);
  
  // 플레이어 이름
  setFont(ctx, 28, false);
  ctx.fillStyle = '#9966CC';
  ctx.textAlign = 'left';
  ctx.fillText(player1.name, 300, 600);
  
  ctx.fillStyle = '#53b18c';
  ctx.textAlign = 'right';
  ctx.fillText(player2.name, 900, 600);
  
  // 구분선
  ctx.strokeStyle = '#FF4654';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(300, 610);
  ctx.lineTo(900, 610);
  ctx.stroke();
  
  // 통계 테이블 - 간격 및 레이아웃 개선
  const tableStartY = 640;
  const tableRowHeight = 50;
  
  function drawStatRow(label, value1, value2, y, isGood1) {
    // 라벨 (가운데)
    setFont(ctx, 26, true);
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(label, width / 2, y);
    
    // 값 1 (왼쪽)
    setFont(ctx, 26, false);
    ctx.fillStyle = isGood1 ? '#36EBCA' : '#FF4654';
    ctx.textAlign = 'right';
    ctx.fillText(value1, width / 2 - 80, y);
    
    // 값 2 (오른쪽)
    ctx.fillStyle = !isGood1 ? '#36EBCA' : '#FF4654';
    ctx.textAlign = 'left';
    ctx.fillText(value2, width / 2 + 80, y);
  }
  
  // K/D/A
  drawStatRow('K/D/A', 
    formatKDA(stats1.avgKills, stats1.avgDeaths, stats1.avgAssists),
    formatKDA(stats2.avgKills, stats2.avgDeaths, stats2.avgAssists),
    tableStartY, 
    parseFloat(stats1.kda) > parseFloat(stats2.kda));
  
  // KDA
  drawStatRow('KDA', 
    stats1.kda,
    stats2.kda,
    tableStartY + tableRowHeight, 
    parseFloat(stats1.kda) > parseFloat(stats2.kda));
  
  // 평균 데미지
  drawStatRow('평균 데미지', 
    stats1.avgDamage,
    stats2.avgDamage,
    tableStartY + tableRowHeight * 2, 
    stats1.avgDamage > stats2.avgDamage);
  
  // 헤드샷 %
  drawStatRow('헤드샷 %', 
    `${stats1.headshotPercent}%`,
    `${stats2.headshotPercent}%`,
    tableStartY + tableRowHeight * 3, 
    stats1.headshotPercent > stats2.headshotPercent);
  
  // 승률
  drawStatRow('승률', 
    `${stats1.winRate}%`,
    `${stats2.winRate}%`,
    tableStartY + tableRowHeight * 4, 
    stats1.winRate > stats2.winRate);
  
  // 최고 킬
  drawStatRow('최고 킬', 
    stats1.mostKillsInMatch,
    stats2.mostKillsInMatch,
    tableStartY + tableRowHeight * 5, 
    stats1.mostKillsInMatch > stats2.mostKillsInMatch);
  
  // 하단 정보
  setFont(ctx, 18, false);
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText(`최근 ${player1Data.matches.length}게임 기준 | ${new Date().toLocaleDateString('ko-KR')}`, width / 2, height - 25);
  
  // 발로란트 로고 스타일 (각진 디자인)
  ctx.fillStyle = '#FF4654';
  ctx.textAlign = 'right';
  
  // 로고 배경
  ctx.beginPath();
  ctx.moveTo(width - 220, height - 70);
  ctx.lineTo(width - 30, height - 70);
  ctx.lineTo(width - 30, height - 40);
  ctx.lineTo(width - 50, height - 20);
  ctx.lineTo(width - 220, height - 20);
  ctx.closePath();
  ctx.fill();
  
  // 로고 텍스트
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('VALORANT', width - 50, height - 35);

  return canvas.toBuffer();
}

export const compareCommand = {
  name: ['ㅂ비교', 'ㅂㅂㄱ'],
  execute: async (message, args) => {
    try {
      let player1, player2;

      // 인자 처리
      if (args.length === 0) {
        return message.reply('❌ 비교할 플레이어를 입력해주세요. (예: ㅂ비교 닉네임1#태그1 닉네임2#태그2)');
      } else if (args.length === 1) {
        // 첫 번째 플레이어는 명령어 사용자의 등록된 계정
        const guildId = message.guild.id;
        const userId = message.author.id;
        const docRef = doc(db, 'valorant_accounts', guildId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists() || !docSnap.data()[userId]) {
          return message.reply('❌ 등록된 계정이 없습니다. 두 플레이어의 닉네임을 모두 입력해주세요.');
        }

        const userData = docSnap.data()[userId];
        player1 = {
          name: userData.valorantName,
          tag: userData.valorantTag
        };

        if (!args[0].includes('#')) {
          return message.reply('❌ 올바른 형식이 아닙니다. (예: 닉네임#태그)');
        }
        const [name2, tag2] = args[0].split('#');
        player2 = { name: name2, tag: tag2 };
      } else {
        // 두 플레이어 모두 직접 입력
        if (!args[0].includes('#') || !args[1].includes('#')) {
          return message.reply('❌ 올바른 형식이 아닙니다. (예: 닉네임1#태그1 닉네임2#태그2)');
        }
        const [name1, tag1] = args[0].split('#');
        const [name2, tag2] = args[1].split('#');
        player1 = { name: name1, tag: tag1 };
        player2 = { name: name2, tag: tag2 };
      }

      const loadingMsg = await message.reply('🔍 전적을 비교중입니다...');

      try {
        // 두 플레이어의 데이터를 병렬로 가져오기
        const [player1Account, player2Account] = await Promise.all([
          valorantApi.getAccount(player1.name, player1.tag),
          valorantApi.getAccount(player2.name, player2.tag)
        ]);

        // MMR과 매치 데이터도 병렬로 가져오기
        const [
          player1MMR,
          player2MMR,
          player1Matches,
          player2Matches
        ] = await Promise.all([
          valorantApi.getMMR(player1Account.region, player1Account.puuid),
          valorantApi.getMMR(player2Account.region, player2Account.puuid),
          valorantApi.getMatches(player1Account.region, player1.name, player1.tag, 10),
          valorantApi.getMatches(player2Account.region, player2.name, player2.tag, 10)
        ]);

        // 플레이어 데이터 객체 생성
        const player1Data = {
          mmr: player1MMR,
          matches: player1Matches,
          playerCard: player1Account.card.small,
          accountLevel: player1Account.account_level,
          mostPlayedAgent: getMostPlayedAgent(player1Matches, player1.name, player1.tag)
        };

        const player2Data = {
          mmr: player2MMR,
          matches: player2Matches,
          playerCard: player2Account.card.small,
          accountLevel: player2Account.account_level,
          mostPlayedAgent: getMostPlayedAgent(player2Matches, player2.name, player2.tag)
        };

        // 통계 계산
        const stats1 = calculateStats(player1Matches, player1.name, player1.tag, player1Data.mostPlayedAgent, player1MMR);
        const stats2 = calculateStats(player2Matches, player2.name, player2.tag, player2Data.mostPlayedAgent, player2MMR);

        // 맵 통계 계산
        player1Data.mapStats = calculateMapStats(player1Matches, player1.name, player1.tag);
        player2Data.mapStats = calculateMapStats(player2Matches, player2.name, player2.tag);

        // 캔버스 이미지 생성
        const imageBuffer = await createComparisonImage(
          player1, player2, stats1, stats2, player1Data, player2Data
        );
        
        // 첨부 파일 생성
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'comparison.png' });

        // 맵별 승률 계산
        let mapStatsText1 = '';
        let mapStatsText2 = '';
        
        for (const [mapName, stats] of Object.entries(player1Data.mapStats || {})) {
          const total = stats.wins + stats.losses;
          const winRate = total > 0 ? ((stats.wins / total) * 100).toFixed(1) : '0.0';
          mapStatsText1 += `${mapName}: ${stats.wins}승 ${stats.losses}패 (${winRate}%)\n`;
        }
        
        for (const [mapName, stats] of Object.entries(player2Data.mapStats || {})) {
          const total = stats.wins + stats.losses;
          const winRate = total > 0 ? ((stats.wins / total) * 100).toFixed(1) : '0.0';
          mapStatsText2 += `${mapName}: ${stats.wins}승 ${stats.losses}패 (${winRate}%)\n`;
        }

        const embed = {
          color: 0xFF4654,
          author: {
            name: '🆚 플레이어 전적 비교'
          },
          title: `${player1.name}#${player1.tag} vs ${player2.name}#${player2.tag}`,
          description: `최근 ${player1Data.matches.length}게임 비교 결과`,
          fields: [
            {
              name: '🎖️ 티어 정보',
              value: [
                `🏆 **현재 티어**`,
                `> ${player1Data.mmr.current_data.currenttierpatched} (${player1Data.mmr.current_data.ranking_in_tier}RR)`,
                `> ${player2Data.mmr.current_data.currenttierpatched} (${player2Data.mmr.current_data.ranking_in_tier}RR)`,
                '',
                `👑 **최고 티어**`,
                `> ${player1Data.mmr.highest_rank.patched_tier}`,
                `> ${player2Data.mmr.highest_rank.patched_tier}`
              ].join('\n'),
              inline: false
            },
            {
              name: '📊 매치 평균',
              value: [
                formatComparison('K/D/A', 
                  formatKDA(stats1.avgKills, stats1.avgDeaths, stats1.avgAssists),
                  formatKDA(stats2.avgKills, stats2.avgDeaths, stats2.avgAssists)
                ),
                formatComparison('KDA', stats1.kda, stats2.kda),
                formatComparison('평균 데미지', stats1.avgDamage.toLocaleString(), stats2.avgDamage.toLocaleString()),
                formatComparison('평균 전투 점수', stats1.avgScore.toLocaleString(), stats2.avgScore.toLocaleString()),
                stats1.avgFirstBloods > 0 || stats2.avgFirstBloods > 0 ? 
                  formatComparison('평균 선취킬', stats1.avgFirstBloods, stats2.avgFirstBloods) : ''
              ].filter(Boolean).join('\n'),
              inline: false
            },
            {
              name: '🎯 정확도',
              value: [
                formatComparison('헤드샷 비율', stats1.headshotPercent, stats2.headshotPercent, false, 'percent'),
                '',
                '**샷 분포 (헤드/바디/레그)**',
                `> ${player1.name}: ${stats1.headshots}/${stats1.bodyshots}/${stats1.legshots}`,
                `> ${player2.name}: ${stats2.headshots}/${stats2.bodyshots}/${stats2.legshots}`
              ].join('\n'),
              inline: false
            },
            {
              name: '💫 하이라이트',
              value: [
                formatComparison('최다 킬', stats1.mostKillsInMatch, stats2.mostKillsInMatch),
                formatComparison('최고 점수', stats1.highestScore.toLocaleString(), stats2.highestScore.toLocaleString()),
                stats1.clutches > 0 || stats2.clutches > 0 ? 
                  formatComparison('클러치', stats1.clutches, stats2.clutches) : '',
                stats1.plants > 0 || stats2.plants > 0 ? 
                  formatComparison('스파이크 설치', stats1.plants, stats2.plants) : '',
                stats1.defuses > 0 || stats2.defuses > 0 ? 
                  formatComparison('스파이크 해체', stats1.defuses, stats2.defuses) : ''
              ].filter(Boolean).join('\n'),
              inline: false
            },
            {
              name: '📈 전적',
              value: [
                formatComparison('승률', stats1.winRate, stats2.winRate, false, 'percent'),
                '',
                `**${player1.name}**: ${stats1.wins}승 ${player1Data.matches.length - stats1.wins}패`,
                `**${player2.name}**: ${stats2.wins}승 ${player2Data.matches.length - stats2.wins}패`
              ].join('\n'),
              inline: false
            },
            {
              name: '👥 가장 많이 사용한 요원',
              value: [
                `**${player1.name}**: ${stats1.mostPlayedAgent}`,
                `**${player2.name}**: ${stats2.mostPlayedAgent}`
              ].join('\n'),
              inline: false
            }
          ],
          footer: {
            text: '🟢 더 좋음 | 🔴 더 낮음 | ⚪ 동일'
          },
          timestamp: new Date(),
          image: {
            url: 'attachment://comparison.png'
          }
        };

        // 맵별 통계가 있으면 필드 추가
        if (mapStatsText1 || mapStatsText2) {
          embed.fields.push({
            name: '🗺️ 맵별 전적',
            value: [
              `**${player1.name}**:`,
              mapStatsText1 || '데이터 없음',
              '',
              `**${player2.name}**:`,
              mapStatsText2 || '데이터 없음'
            ].join('\n'),
            inline: false
          });
        }

        // 0인 통계는 필드에서 제외
        embed.fields = embed.fields.filter(field => 
          field.value && field.value.trim() !== ''
        );

        // 메시지 전송
        await loadingMsg.edit({
          content: null,
          embeds: [embed],
          files: [attachment]
        });

      } catch (error) {
        console.error('비교 중 오류:', error);
        return loadingMsg.edit('❌ 전적 비교 중 오류가 발생했습니다.');
      }

    } catch (error) {
      console.error('비교 명령어 오류:', error);
      return message.reply('❌ 명령어 처리 중 오류가 발생했습니다.');
    }
  }
};

// 가장 많이 사용한 요원 찾기 함수
function getMostPlayedAgent(matches, playerName, playerTag) {
  const agentCounts = {};
  
  matches.forEach(match => {
    const player = match.players.all_players.find(p => 
      p.name.toLowerCase() === playerName.toLowerCase() && 
      p.tag.toLowerCase() === playerTag.toLowerCase()
    );
    
    if (player && player.character) {
      agentCounts[player.character] = (agentCounts[player.character] || 0) + 1;
    }
  });

  return Object.entries(agentCounts)
    .sort(([,a], [,b]) => b - a)[0]?.[0] || "Unknown";
}

// 맵 통계 계산 함수
function calculateMapStats(matches, playerName, playerTag) {
  const mapStats = {};
  
  matches.forEach(match => {
    const player = match.players.all_players.find(p => 
      p.name.toLowerCase() === playerName.toLowerCase() && 
      p.tag.toLowerCase() === playerTag.toLowerCase()
    );
    
    if (player) {
      const map = match.metadata.map;
      const playerTeam = player.team.toLowerCase();
      const wonMatch = match.teams[playerTeam]?.has_won;
      
      if (!mapStats[map]) {
        mapStats[map] = { wins: 0, losses: 0 };
      }
      
      if (wonMatch) {
        mapStats[map].wins++;
      } else {
        mapStats[map].losses++;
      }
    }
  });

  return mapStats;
} 