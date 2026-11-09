using System.Net;
using System.Text;
using Erghi.SDK.Errors;
using Erghi.SDK.Models;
using Erghi.SDK.Resources;
using Xunit;

namespace Erghi.SDK.Tests;

/// <summary>Pins the insights wire contract: paths, query names and camelCase bodies.</summary>
public class InsightsContractTests
{
    private const string Summary = """
        {"total":4,"aiResolvedRate":0.5,"outcomes":[{"key":"ResolvedByAi","count":2}],
         "sentiments":[],"categories":[],"topics":[{"key":"refund","count":3}],"languages":[{"key":"ar","count":4}]}
        """;

    private const string Page = """
        {"total":1,"page":2,"pageSize":50,"items":[{"conversationId":"7b1c0d2e-0000-4000-8000-000000000001",
         "topic":"refund","category":"billing","sentiment":"Negative","sentimentEnd":"Neutral",
         "outcome":"ResolvedByAgent","language":"ar-EG","summary":"Asked for a refund.","confidence":0.9,
         "classifiedAt":"2026-11-09T10:00:00Z","stale":false}]}
        """;

    private sealed class Stub(string body, HttpStatusCode status = HttpStatusCode.OK, string mediaType = "application/json")
        : HttpMessageHandler
    {
        public List<HttpRequestMessage> Seen { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Seen.Add(request);
            return Task.FromResult(new HttpResponseMessage(status)
            {
                Content = new StringContent(body, Encoding.UTF8, mediaType),
            });
        }
    }

    private static (Stub, InsightsResource) Make(string body, HttpStatusCode status = HttpStatusCode.OK, string mediaType = "application/json")
    {
        var stub = new Stub(body, status, mediaType);
        var http = new HttpClient(stub) { BaseAddress = new Uri("http://erghi.test/") };
        return (stub, new InsightsResource(http));
    }

    [Fact]
    public async Task Summary_SendsOnlySetFilters_AndMapsBody()
    {
        var (stub, insights) = Make(Summary);

        var result = await insights.SummaryAsync(new InsightFilter(
            From: new DateTimeOffset(2026, 11, 1, 0, 0, 0, TimeSpan.Zero),
            Outcome: "resolved_by_ai", MinConfidence: 0.5, Topic: ""));

        var uri = stub.Seen[0].RequestUri!;
        Assert.Equal("/api/v1/insights/summary", uri.AbsolutePath);
        Assert.Equal("?from=2026-11-01T00%3A00%3A00.0000000Z&outcome=resolved_by_ai&minConfidence=0.5", uri.Query);
        Assert.Equal(4, result.Total);
        Assert.Equal(0.5, result.AiResolvedRate);
        Assert.Equal("refund", result.Topics[0].Key);
    }

    [Fact]
    public async Task Summary_WithoutFilter_HasNoQuery()
    {
        var (stub, insights) = Make(Summary);
        await insights.SummaryAsync();
        Assert.Equal("", stub.Seen[0].RequestUri!.Query);
    }

    [Fact]
    public async Task ListConversations_PagesAndParsesRows()
    {
        var (stub, insights) = Make(Page);

        var result = await insights.ListConversationsAsync(
            new InsightFilter(Channel: "widget", Sentiment: "negative"), page: 2, pageSize: 50);

        Assert.Equal("/api/v1/insights/conversations", stub.Seen[0].RequestUri!.AbsolutePath);
        Assert.Equal("?channel=widget&sentiment=negative&page=2&pageSize=50", stub.Seen[0].RequestUri!.Query);
        Assert.Equal(50, result.PageSize);
        var row = Assert.Single(result.Items);
        Assert.Equal("ar-EG", row.Language);
        Assert.Equal("Neutral", row.SentimentEnd);
        Assert.Equal(2026, row.ClassifiedAt.Year);
    }

    [Fact]
    public async Task ExportCsv_ReturnsTextWithBom()
    {
        var csv = "conversation_id,classified_at\r\n"; // the decoder drops the server's BOM
        var (stub, insights) = Make(csv, mediaType: "text/csv");

        var result = await insights.ExportCsvAsync(new InsightFilter(To: new DateTimeOffset(2026, 12, 1, 0, 0, 0, TimeSpan.Zero)));

        Assert.Equal("/api/v1/insights/export.csv", stub.Seen[0].RequestUri!.AbsolutePath);
        Assert.Equal(csv, result);
    }

    [Fact]
    public async Task InvalidFilter_ThrowsValidationException_WithServerMessage()
    {
        var (_, insights) = Make(
            """{"error":"sentiment must be positive, neutral or negative.","code":"invalid_filter"}""",
            HttpStatusCode.BadRequest);

        var ex = await Assert.ThrowsAsync<ValidationException>(
            () => insights.SummaryAsync(new InsightFilter(Sentiment: "angry")));
        Assert.Contains("sentiment must be", ex.Message);
    }
}
