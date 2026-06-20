import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

describe('App component', () => {
  it('renders TopNavigationBar and SideNavigationBar', () => {
    render(<App />);
    const navBars = screen.getAllByRole('navigation');
    expect(navBars).toHaveLength(2);
  });

  //TODO: Add more tests for API calls and component interactions (MSW)
  //Will need to have the component handle the response in some way to test it effectively, such as displaying data or showing a loading state
});
