import { Injectable } from '@nestjs/common';

// The one external, unchecked boundary this feature touches (Constitution
// II) — narrowed here, at the point the data is received, and nowhere else.
export interface GithubProfile {
  githubId: string;
  login: string;
  name: string | null;
  avatarUrl: string;
  verifiedEmail: string | null;
}

interface GithubTokenResponse {
  access_token?: string;
  error?: string;
}

interface GithubUserResponse {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
}

interface GithubEmailResponse {
  email: string;
  primary: boolean;
  verified: boolean;
}

const GITHUB_SCOPE = 'read:user user:email';

// Two/three plain HTTP calls — deliberately no OAuth client library, see
// specs/009-developer-github-oauth/plan.md Technical Context.
@Injectable()
export class GithubOauthClient {
  buildAuthorizeUrl(state: string): string {
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', this.clientId());
    url.searchParams.set('redirect_uri', this.callbackUrl());
    url.searchParams.set('scope', GITHUB_SCOPE);
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeCodeForToken(code: string): Promise<string> {
    const response = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: this.clientId(),
          client_secret: this.clientSecret(),
          code,
          redirect_uri: this.callbackUrl(),
        }),
      },
    );

    const data = (await response.json()) as GithubTokenResponse;
    if (!data.access_token) {
      throw new Error(
        `GitHub token exchange failed: ${data.error ?? 'no access_token in response'}`,
      );
    }
    return data.access_token;
  }

  // Fetches the profile and, per research.md Decision 5, resolves the
  // verified primary email from /user/emails — never trusted from /user
  // alone, whose own `email` field carries no verification signal.
  async fetchProfile(accessToken: string): Promise<GithubProfile> {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
    };

    const [userResponse, emailsResponse] = await Promise.all([
      fetch('https://api.github.com/user', { headers }),
      fetch('https://api.github.com/user/emails', { headers }),
    ]);

    const user = (await userResponse.json()) as GithubUserResponse;
    const emails = (await emailsResponse.json()) as GithubEmailResponse[];

    const verifiedPrimary = Array.isArray(emails)
      ? emails.find((e) => e.primary && e.verified)
      : undefined;

    return {
      githubId: String(user.id),
      login: user.login,
      name: user.name,
      avatarUrl: user.avatar_url,
      verifiedEmail: verifiedPrimary?.email ?? null,
    };
  }

  private clientId(): string {
    return process.env.GITHUB_OAUTH_CLIENT_ID ?? '';
  }

  private clientSecret(): string {
    return process.env.GITHUB_OAUTH_CLIENT_SECRET ?? '';
  }

  private callbackUrl(): string {
    return process.env.GITHUB_OAUTH_CALLBACK_URL ?? '';
  }
}
