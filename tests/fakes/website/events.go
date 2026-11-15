package website

// ChallengeServed is published for every challenge request, whatever the status.
type ChallengeServed struct{ Fetch }

func (ChallengeServed) EventName() string { return "website.challenge-served" }
