// Reply engine example: your own agent answers a widget's visitors.
//
//   ERGHI_API_URL        https://api.erghi.ai
//   ERGHI_CLIENT_ID      API key client id, with the agent:runtime scope
//   ERGHI_CLIENT_SECRET  its secret
//   ERGHI_ENGINE_ID      a LiveConnection engine (live mode)
//   ERGHI_WEBHOOK_SECRET the whsec_ secret shown once when a Webhook engine was created (webhook mode)
//
//   dotnet run            live mode: connects out to Erghi, no public URL needed
//   dotnet run -- webhook webhook mode: Erghi POSTs each turn to POST /erghi/turns

using Erghi.SDK;
using Erghi.SDK.Errors;
using Erghi.SDK.Models;

var apiUrl = Environment.GetEnvironmentVariable("ERGHI_API_URL") ?? "http://localhost:5000";
var clientId = Environment.GetEnvironmentVariable("ERGHI_CLIENT_ID")!;
var clientSecret = Environment.GetEnvironmentVariable("ERGHI_CLIENT_SECRET")!;

// Your agent: replace this with a model call. Keep it under the engine's timeout (default 20 s).
static string Answer(TurnRequest turn) =>
    $"You said: {turn.Messages.LastOrDefault()?.Content}";

if (args.FirstOrDefault() == "webhook")
{
    await using var erghi = new ErghiClient(new ErghiConfig { ApiUrl = apiUrl, ClientId = clientId, ClientSecret = clientSecret });
    var secret = Environment.GetEnvironmentVariable("ERGHI_WEBHOOK_SECRET")!;
    var app = WebApplication.CreateBuilder(args).Build();

    app.MapPost("/erghi/turns", async (HttpRequest request) =>
    {
        // Verify the RAW body before parsing it.
        using var reader = new StreamReader(request.Body);
        var body = await reader.ReadToEndAsync();
        TurnRequest turn;
        try { turn = ErghiWebhooks.VerifyAndParseTurn(secret, h => request.Headers[h].ToString(), body); }
        catch (WebhookVerificationException) { return Results.Unauthorized(); }

        if (turn.IsTest) return Results.Ok(); // "Test connection" from the portal

        // Reply later through the API (202), or return the reply JSON in this response.
        _ = Task.Run(async () =>
        {
            try { await erghi.AgentRuntime.ReplyAsync(turn.TurnId, AgentReply.Of($"{turn.TurnId}:1", Answer(turn))); }
            catch (ErghiApiException ex) when (ex.Code is "turn_closed" or "turn_superseded") { /* too late, nothing posted */ }
        });
        return Results.Accepted();
    });

    await app.RunAsync();
}
else
{
    await using var agent = new AgentRuntimeClient(new AgentRuntimeOptions
    {
        ApiUrl = apiUrl,
        EngineId = Environment.GetEnvironmentVariable("ERGHI_ENGINE_ID")!,
        ClientId = clientId,
        ClientSecret = clientSecret,
    });

    agent.TurnRequested += async turn =>
    {
        var ack = await agent.AckAsync(turn.TurnId);
        if (ack.Claimed == false || turn.IsTest) return; // another instance has it
        await agent.TypingAsync(turn.TurnId);
        var result = await agent.ReplyCompleteAsync(turn.TurnId, AgentReply.Of($"{turn.TurnId}:1", Answer(turn)));
        if (!result.Ok) Console.Error.WriteLine($"Reply refused: {result.Code} {result.Error}");
    };
    agent.Resumed += n => Console.WriteLine($"Reconnected, {n} open turn(s) re-sent");

    await agent.StartAsync();
    Console.WriteLine("Waiting for turns. Ctrl+C to stop.");
    await Task.Delay(Timeout.Infinite);
}
