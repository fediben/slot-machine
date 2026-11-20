// Opt-in adapter – DO NOT activate until the Unity scene is configured and tested.
// It leaves the legacy reel animation and scoring implementation in place.
using System;
using UnityEngine;

public class KioskGameBridge : MonoBehaviour
{
    public KioskApiClient api;
    public KioskInput buttons;
    public ReelManager reels;
    public ScoreManager scores;
    public PigParadeManager pigs;
    public SoundManager sound;
    public KioskQrDisplay qrView;

    private string knownSession;
    private string pendingToken, roundSession;
    private int creditAtStart, roundCost;
    private bool roundInProgress, reserving, reconciling;
    private float endStableFor;

    void Awake()
    {
        if (reels != null) reels.ManagedByKiosk = true; // Fail closed: old input/login is disabled.
    }
    void OnEnable()
    {
        if (buttons == null) return;
        buttons.Spin += OnSpin;
        buttons.BetOne += OnBetOne;
        buttons.BetThree += OnBetThree;
        buttons.Join += OnJoin;
        buttons.End += OnEnd;
    }
    void OnDisable()
    {
        if (buttons == null) return;
        buttons.Spin -= OnSpin;
        buttons.BetOne -= OnBetOne;
        buttons.BetThree -= OnBetThree;
        buttons.Join -= OnJoin;
        buttons.End -= OnEnd;
    }
    void Update()
    {
        if (api == null || reels == null || scores == null) return;
        if (api.ActiveSessionId != knownSession && !roundInProgress && !reserving && !reconciling)
        {
            knownSession = api.ActiveSessionId;
            reels.PLAYER_ACTIVE = !string.IsNullOrEmpty(knownSession);
            scores.instantUpdateCredit(reels.PLAYER_ACTIVE ? api.ServerCredits : 0);
            if (reels.PLAYER_ACTIVE && qrView != null) qrView.Clear();
        }
        if (roundInProgress)
        {
            // The original game has auto-respins and lengthy winning animations.
            // Wait for the scene to report a stable, completed round, then reconcile once.
            bool ready = reels.GAME_PLAYABLE && reels.respins_available == 0 &&
                !scores.animatingScore && scores.scoreCheckDone && scores.coinCheckDone &&
                (pigs == null || (!pigs.pigsBouncing && !pigs.pigsMoving));
            endStableFor = ready ? endStableFor + Time.deltaTime : 0;
            if (endStableFor >= 1.0f)
            {
                int award = Math.Max(0, scores.getCredit() - (creditAtStart - roundCost));
                api.QueueCompletedScore(roundSession, pendingToken, award, "");
                pendingToken = null;
                roundSession = null;
                roundInProgress = false;
                reconciling = true;
                endStableFor = 0;
            }
        }
        if (reconciling && api.PendingScoreCount == 0 && api.ServerCredits == scores.getCredit())
            reconciling = false;
        // Machine disable stops the next credit reservation, not an already running spin.
    }
    void OnSpin()
    {
        if (api == null || reels == null || scores == null ||
            !api.AcceptNewGames || !reels.GAME_PLAYABLE || !reels.PLAYER_ACTIVE ||
            roundInProgress || reserving || reconciling || api.PendingScoreCount > 0)
            return;
        int cost = reels.lines_played == 3 ? 150 : 50;
        if (scores.getCredit() < cost) return;
        creditAtStart = scores.getCredit();
        roundCost = cost;
        reserving = true;
        string requestedSession = api.ActiveSessionId;
        api.ReserveSpin(cost, (ok, token) =>
        {
            reserving = false;
            if (!ok || !api.AcceptNewGames || requestedSession != api.ActiveSessionId)
            {
                Debug.LogWarning("Spin reservation refused or machine disabled: " + token);
                return;
            }
            // Local spend now agrees with the server-issued, one-use spin token.
            if (!scores.SubtractGameCost(reels.lines_played))
            {
                Debug.LogError("Local credit mismatch – call operator; spin token already issued");
                return;
            }
            roundSession = requestedSession;
            pendingToken = token;
            roundInProgress = true;
            endStableFor = 0;
            reels.playRound();
        });
    }
    void OnBetOne()
    {
        if (reels == null || !reels.GAME_PLAYABLE || roundInProgress || reserving) return;
        reels.lines_played = 1;
        if (pigs != null) pigs.updatePigs(1);
        if (sound != null) sound.Bet1();
        if (reels.gem_inlays != null) reels.gem_inlays.sprite = reels.gems_cheap;
        if (reels.jackpot_inlay != null) reels.jackpot_inlay.sprite = reels.jackpot_cheap;
        if (reels.lines_field != null) reels.lines_field.text = "1";
        if (reels.current_bet_field != null) reels.current_bet_field.text = "50 credits";
    }
    void OnBetThree()
    {
        if (reels == null || !reels.GAME_PLAYABLE || roundInProgress || reserving) return;
        reels.lines_played = 3;
        if (pigs != null) pigs.updatePigs(3);
        if (sound != null) sound.Bet3();
        if (reels.gem_inlays != null) reels.gem_inlays.sprite = reels.gems_expensive;
        if (reels.jackpot_inlay != null) reels.jackpot_inlay.sprite = reels.jackpot_expensive;
        if (reels.lines_field != null) reels.lines_field.text = "3";
        if (reels.current_bet_field != null) reels.current_bet_field.text = "150 credits";
    }
    void OnJoin()
    {
        if (api == null || !string.IsNullOrEmpty(api.ActiveSessionId) || roundInProgress) return;
        api.RequestCheckin((ok, url) =>
        {
            if (!ok) { Debug.LogWarning("QR unavailable: " + url); return; }
            if (qrView != null) qrView.SetLink(url);
        });
    }
    void OnEnd()
    {
        if (api == null || roundInProgress || reserving || reconciling || api.PendingScoreCount > 0)
            return;
        api.EndSession((ok, response) =>
        {
            if (!ok) { Debug.LogWarning("End session failed: " + response); return; }
            knownSession = null;
            if (reels != null) reels.PLAYER_ACTIVE = false;
            if (scores != null) scores.instantUpdateCredit(0);
        });
    }
}
